import React from 'react'

export default function SLAPanel () {

  return (

    <div className='p-4 border rounded'>

      <h2 className='text-xl font-bold mb-4'>
        SLA Metrics
      </h2>

      <p>Uptime: 99.92%</p>

      <p>MTTR: 2 minutes</p>

      <p>MTBF: 18 hours</p>

      <p>Incidents: 4</p>

    </div>
  )
}