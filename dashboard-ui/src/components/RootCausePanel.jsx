import React from 'react'

export default function RootCausePanel () {

  const analysis = {

    rootCause: 'payment-service overloaded',

    affectedServices: [
      'order-service',
      'notification-service'
    ],

    confidence: 0.91
  }

  return (

    <div className='p-4 border rounded'>

      <h2 className='text-xl font-bold mb-4'>
        Root Cause Analysis
      </h2>

      <p>
        Root Cause:
        {analysis.rootCause}
      </p>

      <p>
        Confidence:
        {analysis.confidence}
      </p>

      <p>
        Affected Services:
      </p>

      <ul>

        {

          analysis.affectedServices.map(service => (

            <li key={service}>
              {service}
            </li>
          ))
        }

      </ul>

    </div>
  )
}