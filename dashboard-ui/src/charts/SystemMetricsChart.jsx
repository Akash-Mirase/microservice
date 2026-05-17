import React from 'react'

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Legend
} from 'recharts'

const data = [

  {
    time: '11:00',
    cpu: 30,
    memory: 40
  },

  {
    time: '11:05',
    cpu: 45,
    memory: 55
  },

  {
    time: '11:10',
    cpu: 80,
    memory: 70
  },

  {
    time: '11:15',
    cpu: 95,
    memory: 88
  },

  {
    time: '11:20',
    cpu: 50,
    memory: 45
  }
]

export default function SystemMetricsChart () {

  return (

    <LineChart
      width={800}
      height={400}
      data={data}
    >

      <CartesianGrid strokeDasharray='3 3' />

      <XAxis dataKey='time' />

      <YAxis />

      <Tooltip />

      <Legend />

      <Line
        type='monotone'
        dataKey='cpu'
      />

      <Line
        type='monotone'
        dataKey='memory'
      />

    </LineChart>
  )
}