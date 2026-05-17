import React from 'react'

const incidents = [

  '11:00 CPU spike detected',

  '11:01 anomaly classified',

  '11:02 recovery initiated',

  '11:03 service restored'
]

export default function IncidentTimeline () {

  return (

    <div className='p-4'>

      <h2 className='text-xl font-bold mb-4'>
        Incident Timeline
      </h2>

      {

        incidents.map((item, index) => (

          <div
            key={index}
            className='mb-3 p-3 border rounded'
          >

            {item}

          </div>
        ))
      }

    </div>
  )
}