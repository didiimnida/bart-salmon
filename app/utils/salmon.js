// @flow
import _ from 'lodash'
import type {StationName, RouteId, SalmonRoute} from './flow'
import {forceArray} from './general'

import routesLookup from '../data/routes.json'
import stationsLookup from '../data/stations.json'
import stationRoutesLookup from '../data/station-routes.json'

// minimum number of minutes to wait at the backwards station
// the higher this number is the more likely to make the train
const MINIMUM_BACKWARDS_STATION_WAIT_TIME = 1

const _STATION_ROUTE_DIRECTIONS = _(['northRoutes', 'southRoutes'])

const _isStationARouteStation = (target: StationName, {name}): boolean => name === target

/*
 * Determines if the specified origin & destination are in the list of stations
 * (for a route) with origin coming before destination
 */
const _areStationsOnRouteStations = (start: StationName, end: StationName, stations): boolean => {
    let startIndex = stations.findIndex(_isStationARouteStation.bind(null, start))
    let endIndex = stations.findIndex(_isStationARouteStation.bind(null, end))

    return startIndex > -1 && startIndex < endIndex
}

const _getRouteIdsWithStartAndEnd = (start: StationName, end: StationName, trainColor: ?string = undefined): RouteId[] => (
    // get all of the routes that directly connect the two stations
    _(stationRoutesLookup[start][end].directRoutes)
        // optionally filter down to routes that match the optional trainColor
        .filter((routeId: RouteId): boolean => !trainColor || routesLookup[routeId].color === trainColor)
        .value()
)

/*
 * Given an origin and destination station, returns the routes that contain both,
 * optionally using routes that would require transfers
 */
const _getTargetRouteIds = (origin: StationName, destination: StationName, allowTransfers: ?boolean = false): RouteId[] => {
    let stationRoutesInfo = stationRoutesLookup[origin][destination]
    let targetRouteIds = stationRoutesInfo.directRoutes || []

    // If targetRouteIds is empty, there is no direct route that connects the two
    // stations so we need to find *start* route trains for multi-train routes
    if ((allowTransfers || _.isEmpty(targetRouteIds)) && stationRoutesInfo.multiRoutes) {
        targetRouteIds = stationRoutesInfo.multiRoutes.map(([startRouteId]) => startRouteId)
    }

    return targetRouteIds
}

const _normalizeMinutes = (minutes: mixed): number => (
    Number.isNaN(minutes) ? 0 : +minutes
)

/*
 * Given a list of route IDs and a source station returns a list of potential
 * train destination stations
 */
const _getAllDestinationsFromRoutes = (sourceStation: StationName, routeIds: RouteId[]): Set<StationName> => new Set (
    _(routeIds)
        // transform each routeId into a nested list of potential train destinations
        .map((routeId) => (
            _(routesLookup[routeId].stations)
                // For all the stations for the given route, filter down to just
                // the stations *after* the source station. These are the possible
                // train destinations
                .takeRightWhile(({name}) => name !== sourceStation)

                // just give back the station names
                .map(({name}) => name)
                .value()
        ))

        // flatten out the list
        .flatten()
)

const _getBackwardsRoutesDestinations = (sourceStation: StationName, targetRouteIds: RouteId[]): Set<StationName> => {
    let stationInfo = stationsLookup[sourceStation]
    let backwardsRouteIds = _STATION_ROUTE_DIRECTIONS
        // get the list of route IDs in either direction
        .map((routeDirection) => stationInfo[routeDirection])

        // find the route IDs in that are in the opposite direction by seeing
        // if the targetRouteIds are NOT in the routes for the direction
        .find((routesInDirection) => _(routesInDirection).intersection(targetRouteIds).isEmpty())

    return _getAllDestinationsFromRoutes(sourceStation, backwardsRouteIds)
}

const _getReturnRouteDestinations = (sourceStation: StationName, targetRouteIds: RouteId[]): Set<StationName> => (
    _getAllDestinationsFromRoutes(sourceStation, targetRouteIds)
)

/*
 * Given a curren station and a set of target routes, returns a list of possible
 * train destinations either in the direction of each of the target routes or the
 * opposite
 */
const _getPossibleRouteDestinations = (
    stationName: StationName,
    targetRouteIds: RouteId[],
    isOpposite: boolean
): Set<StationName> => (
    isOpposite
        ? _getBackwardsRoutesDestinations(stationName, targetRouteIds)
        : _getReturnRouteDestinations(stationName, targetRouteIds)
)

const _genFlattenedDestinationEtdsForStation = (
    stationName: StationName,
    etdsLookup: {[id: string]: Object},
    targetRouteIds: RouteId[],
    isOpposite: boolean = false
) => {
    let possibleRouteDestinations = _getPossibleRouteDestinations(stationName, targetRouteIds, isOpposite)
    let etdsForStation = etdsLookup[stationName].etd

    // console.log({stationName, targetRouteIds, possibleRouteDestinations, isOpposite, etdsForStation})

    return _(etdsForStation)
        // take ETDs grouped by destination & filter down trains to the ones
        // going in specified route direction by looking to see if the train's
        // destination is in the possibleRouteDestinations
        .filter((destinationEtdInfo) => possibleRouteDestinations.has(destinationEtdInfo.abbreviation))

        // for each set of ETDs for the destinations going in the route direction
        // add the destination info to the ETD info
        .map((destinationEtdInfo) => (
            forceArray(destinationEtdInfo.estimate)
                .map((estimateInfo) => ({
                    ..._.omit(destinationEtdInfo, ['estimate']),
                    ...estimateInfo
                }))
        ))

        // flatten out the groupings (now that each one has the destination info)
        .flatten()
}

const _getBackwardsTrains = (origin: StationName, etdsLookup: {[id:string]: Object}, targetRouteIds: RouteId[]) => (
    _genFlattenedDestinationEtdsForStation(origin, etdsLookup, targetRouteIds, true)
        .map((trainInfo) => ({
            backwardsTrain: trainInfo,
            waitTime: _normalizeMinutes(trainInfo.minutes),
            backwardsRouteId: _getRouteIdsWithStartAndEnd(origin, trainInfo.abbreviation, trainInfo.hexcolor)[0]
        }))
)

const _minutesBetweenStation = (start: StationName, end: StationName, routeId: RouteId): number => {
    let routeStations = routesLookup[routeId].stations
    let startRouteStationInfo = routeStations.find(_isStationARouteStation.bind(null, start))
    let endRouteStationInfo = routeStations.find(_isStationARouteStation.bind(null, end))

    return endRouteStationInfo.timeFromOrigin - startRouteStationInfo.timeFromOrigin
}

const _getBackwardsTimeRoutePaths = (_backwardsTrains, origin: StationName) => (
    _backwardsTrains
        // for each backwards train, return a (nested) list of route paths
        // from origin to stations after origin (including time to get to that
        // station)
        .map((trainInfo) => {
            let routeId = trainInfo.backwardsRouteId
            let routeForTrain = routesLookup[routeId]
            let stationsForTrain = routeForTrain.stations

            return _(stationsForTrain)
                // get all the stations after the origin
                .takeRightWhile(({name}) => name !== origin)

                // merge in the train information plus the time it takes from
                // origin to station (backwardsRideTime)
                .map(({name}) => ({
                    ...trainInfo,
                    backwardsStation: name,
                    backwardsRideTime: _minutesBetweenStation(origin, name, routeId)
                }))

                // TODO: Remove for potential optimization?
                .value()
        })

        // flatten out the nested list to get a list of backwards route paths
        // that include info on how long it takes to get to the backwards station
        .flatten()
)

/*
 * Given a list of backward route paths (with times), multiply that by the
 * possible return trains those route paths could wait for.
 */
const _getWaitTimesForBackwardsTimeRoutePaths = (_backwardsTimeRoutePaths, etdsLookup:{[id:string]: Object}, targetRouteIds: RouteId[]) => (
    // for each backwards train, calculate how long it'll take to get to the
    // backwards station (waitTime + backwardsRideTime), then find all of the
    // arrivals to that backwards station within targetRouteIds. Need to filter
    // down to only arrivals to the backwards station that are greater than
    // (waitTime + backwardsRideTime). The valid backwards train arrival time
    // (backwardsArrivalTime) minus (waitTime + backwardsRideTime) is backwardsWaitTime
    _backwardsTimeRoutePaths
        .map((trainInfo) => {
            let {waitTime, backwardsRideTime, backwardsStation} = trainInfo
            let timeToBackwardsStation = waitTime + backwardsRideTime

            return _genFlattenedDestinationEtdsForStation(backwardsStation, etdsLookup, targetRouteIds)
                // after getting all the returning trains on the target routes,
                // include the wait time at the backwards station (negative values
                // mean that there isn't enough time to make it)
                .map((returnTrainInfo) => ({
                    ...trainInfo,
                    returnTrain: returnTrainInfo,
                    backwardsWaitTime: _normalizeMinutes(returnTrainInfo.minutes) - timeToBackwardsStation,
                    returnRouteId: _getRouteIdsWithStartAndEnd(backwardsStation, returnTrainInfo.abbreviation, returnTrainInfo.hexcolor)[0]
                }))

                // only include the trains where the wait time at the backwards
                // station is greater that the minimum allowable to increase the
                // likelihood of making the train
                .filter(({backwardsWaitTime}) => backwardsWaitTime >= MINIMUM_BACKWARDS_STATION_WAIT_TIME)

                // TODO: Remove for potential optimization?
                .value()
        })
        .flatten()
)

const _getSalmonTimeRoutePaths = (_backwardsTimeRoutePathsWithWaits, origin: StationName) => (
    _backwardsTimeRoutePathsWithWaits
        .filter(({backwardsStation, returnRouteId}) => (
            _areStationsOnRouteStations(backwardsStation, origin, routesLookup[returnRouteId].stations)
        ))
        .map((trainInfo) => ({
            ...trainInfo,
            returnRideTime: _minutesBetweenStation(
                trainInfo.backwardsStation,
                origin,
                trainInfo.returnRouteId
            )
        }))
)

const _getAllSalmonRoutesFromEtds = (
    etdsLookup: {[id:string]: Object},
    origin: StationName,
    destination: StationName,
    allowTransfers?: boolean = false
) => {
    // 1. Determine the desired routes based on the origin/destination
    // (w/o making a "trip" API request)
    let targetRouteIds = _getTargetRouteIds(origin, destination, allowTransfers)

    // console.log(targetRouteIds)

    // 2. Generate a list of the trains heading in the OPPOSITE direction w/
    // their arrival times (waitTime)
    let _backwardsTrains = _getBackwardsTrains(origin, etdsLookup, targetRouteIds)

    // console.log(_backwardsTrains.value())
    // console.log('backwardsTrainsSize', _backwardsTrains.size())

    // 3. For each train, determine the estimated time it would take to get to
    // each following station in its route (backwardsRideTime)
    let _backwardsTimeRoutePaths = _getBackwardsTimeRoutePaths(_backwardsTrains, origin)

    // console.log(_backwardsTimeRoutePaths.value())
    // console.log('backwardsTimeRoutePathsSize', _backwardsTimeRoutePaths.size())

    // 4. For each train at each station, determine the estimated wait time until
    // targetRouteId arrives at that station (backwardsWaitTime)
    let _backwardsTimeRoutePathsWithWaits = _getWaitTimesForBackwardsTimeRoutePaths(
        _backwardsTimeRoutePaths,
        etdsLookup,
        targetRouteIds
    )

    // console.log(_backwardsTimeRoutePathsWithWaits.value())
    // console.log('backwardsTimeRoutePathsSize', _backwardsTimeRoutePathsWithWaits.size())

    // 5. For each train at each station after waiting, determine estimated time
    // it would take to return to the origin on target route (returnRideTime)

    let _salmonTimeRoutePaths = _getSalmonTimeRoutePaths(_backwardsTimeRoutePathsWithWaits, origin)

    // console.log(_salmonTimeRoutePaths.value())
    // console.log('salmonTimeRoutePathsSize', _salmonTimeRoutePaths.size())

    return _salmonTimeRoutePaths
}

/*
 * Given origin and destination stations, returns a list of suggested salmon routes
 */
const getSuggestedSalmonRoutesFromEtds = (
    etdsLookup: {[id:string]: Object},
    origin: StationName,
    destination: StationName,
    numSuggestions: number
): SalmonRoute[] => {
    // First try to get salmon routes using only direct lines
    let _allSalmonRoutes = _getAllSalmonRoutesFromEtds(etdsLookup, origin, destination)

    // If no results, then get salmon routes with routes that require a transfer
    if (_allSalmonRoutes.isEmpty()) {
        _allSalmonRoutes = _getAllSalmonRoutesFromEtds(etdsLookup, origin, destination, true)
    }

    return _allSalmonRoutes
        // 6. Add up waitTime + backwardsRideTime + backwardsWaitTime + returnRideTime
        // (salmonTime) for each salmon route path and sort by ascending total time
        // NOTE: This can be made significantly complicated to determine which routes
        // have most priority
        .sortBy([
            // first sort by salmonTime
            ({waitTime, backwardsRideTime, backwardsWaitTime, returnRideTime}) => (
                waitTime + backwardsRideTime + backwardsWaitTime + returnRideTime
            ),
            // then by wait time (for ties in salmonTime)
            ({waitTime, backwardsWaitTime}) => (waitTime + backwardsWaitTime)
        ])

        // 7. Take the first numSuggestions suggestions
        .take(numSuggestions)

        // 8. Sort again? With the set of suggestions, we may want to reprioritize...

        .value()
}

export default getSuggestedSalmonRoutesFromEtds