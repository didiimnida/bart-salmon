import {PropTypes} from 'react'

export const VALUES_PROP_TYPE = PropTypes.arrayOf(
    PropTypes.shape({
        value: PropTypes.string.isRequired,
        display: PropTypes.string
    })
)
