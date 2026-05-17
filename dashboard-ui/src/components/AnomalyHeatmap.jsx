import React from 'react'

const services = [

  {
    name: 'auth',
    risk: 12
  },

  {
    name: 'payment',
    risk: 91
  },

  {
    name: 'order',
    risk: 73
  }
]

function getColor (risk) {

  if (risk > 80) {
    return 'bg-red-500'
  }

  if (risk > 50) {
    return 'bg-yellow-500'
  }

  return 'bg-green-500'
}

export default function AnomalyHeatmap () {

  return (

    <div className='p-4'>

      <h2 className='text-xl font-bold mb-4'>
        Anomaly Heatmap
      </h2>

      {

        services.map(service => (

          <div
            key={service.name}
            className={`p-4 mb-3 text-white rounded ${getColor(service.risk)}`}
          >

            {service.name} - {service.risk}%

          </div>
        ))
      }

    </div>
  )
}