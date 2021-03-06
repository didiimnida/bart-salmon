// @flow
import {getSuggestedSalmonRoutesFromEtds, getNextArrivalsFromEtds} from '../utils/salmon'
import {getEstimatedTimesOfDeparture} from '../api'
import type {StationName, SalmonRoute, Train} from '../utils/flow'
import type {ReduxDispatch, ReduxAction, ReduxAsyncAction, ReduxGetState} from '../actions/flow'

const NUM_ARRIVALS = 4

export const setOrigin = (name: StationName): ReduxAction => ({
    type: 'SET_ORIGIN',
    payload: {
        name
    }
})

export const setDestination = (name: StationName): ReduxAction => ({
    type: 'SET_DESTINATION',
    payload: {
        name
    }
})

export const setNumSalmonRoutes = (numRoutes: number): ReduxAction => ({
    type: 'SET_NUM_SALMON_ROUTES',
    payload: {
        numRoutes
    }
})

const fetchSalmonInfo = (): ReduxAction => ({
    type: 'FETCH_SALMON_INFO'
})

const receiveSalmonInfo = (routes: SalmonRoute[], arrivals: Train[]): ReduxAction => ({
    type: 'RECEIVE_SALMON_INFO',
    payload: {
        routes,
        arrivals
    }
})

const errorSalmonInfo = (error: Error): ReduxAction => ({
    type: 'ERROR_SALMON_INFO',
    error
})

export const getSalmonInfo = (): ReduxAsyncAction => (
    async (dispatch: ReduxDispatch, getState: ReduxGetState) => {
        let {origin, destination, numSalmonRoutes} = getState()

        if (origin && destination) {
            dispatch(fetchSalmonInfo())

            try {
                let etdsLookup = await getEstimatedTimesOfDeparture()
                let salmonRoutes = getSuggestedSalmonRoutesFromEtds(etdsLookup, origin, destination, numSalmonRoutes)
                let arrivals = getNextArrivalsFromEtds(etdsLookup, origin, destination, NUM_ARRIVALS)

                dispatch(receiveSalmonInfo(salmonRoutes, arrivals))
            } catch (error) {
                // TODO: Create a custom Error that wraps this native error message
                // to be more friendly
                dispatch(errorSalmonInfo(error))
            }
        }
    }
)
