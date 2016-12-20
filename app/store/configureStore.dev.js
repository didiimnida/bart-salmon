// @flow
import {createStore, applyMiddleware} from 'redux'
import {composeWithDevTools} from 'redux-devtools-extension'
import thunk from 'redux-thunk'
import createLogger from 'redux-logger'
import rootReducer from '../reducers'

const configureStore = (preloadedState) => {
    let store = createStore(
        rootReducer,
        preloadedState,
        composeWithDevTools(
            applyMiddleware(thunk, createLogger())
        )
    )

    if (module.hot) {
        // Enable Webpack hot module replacement for reducers
        module.hot.accept('../reducers', () => {
            let nextRooterReducer = require('../reducers').default

            store.replaceReducer(nextRooterReducer)
        })
    }

    return store
}

export default configureStore