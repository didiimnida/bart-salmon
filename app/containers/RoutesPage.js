import React, {Component} from 'react'
import {View, Text} from 'react-native'
import {connect} from 'react-redux'
import {getSalmonInfo} from '../actions'
import SalmonRoutes from '../components/SalmonRoutes'

import styles from './RoutesPage.styles'

class Salmon extends Component {
    componentDidMount = () => {
        this.props.dispatchGetSalmonInfo()
    }

    render = () => {
        let {origin, destination, salmonRoutes} = this.props

        return (
            <View style={styles.root}>
                <Text>From: {origin}</Text>
                <Text>To: {destination}</Text>
                <SalmonRoutes routes={salmonRoutes} />
            </View>

        )
    }
}

const _mapStateToProps = ({origin, destination, salmonRoutes, isFetchingSalmonRoutes}) => ({
    origin,
    destination,
    salmonRoutes,
    isDisabled: isFetchingSalmonRoutes
})

const _mapDispatchToProps = {
    dispatchGetSalmonInfo: getSalmonInfo
}

export default connect(_mapStateToProps, _mapDispatchToProps)(Salmon)