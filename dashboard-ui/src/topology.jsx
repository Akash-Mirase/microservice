import React from 'react'
import ReactFlow, {
  Background,
  Controls
} from 'reactflow'

import 'reactflow/dist/style.css'

const nodes = [

  {
    id: '1',
    position: { x: 250, y: 0 },
    data: { label: 'API Gateway' },
    style: {
      background: '#2563eb',
      color: 'white'
    }
  },

  {
    id: '2',
    position: { x: 250, y: 100 },
    data: { label: 'Auth Service' },
    style: {
      background: '#16a34a',
      color: 'white'
    }
  },

  {
    id: '3',
    position: { x: 250, y: 220 },
    data: { label: 'Order Service' },
    style: {
      background: '#16a34a',
      color: 'white'
    }
  },

  {
    id: '4',
    position: { x: 250, y: 340 },
    data: { label: 'Payment Service' },
    style: {
      background: '#dc2626',
      color: 'white'
    }
  },

  {
    id: '5',
    position: { x: 250, y: 460 },
    data: { label: 'Notification Service' },
    style: {
      background: '#f59e0b',
      color: 'white'
    }
  }
]

const edges = [

  {
    id: 'e1-2',
    source: '1',
    target: '2',
    animated: true
  },

  {
    id: 'e2-3',
    source: '2',
    target: '3',
    animated: true
  },

  {
    id: 'e3-4',
    source: '3',
    target: '4',
    animated: true
  },

  {
    id: 'e4-5',
    source: '4',
    target: '5',
    animated: true
  }
]

export default function Topology () {

  return (

    <div style={{ height: '700px' }}>

      <ReactFlow
        nodes={nodes}
        edges={edges}
        fitView
      >

        <Background />
        <Controls />

      </ReactFlow>

    </div>
  )
}