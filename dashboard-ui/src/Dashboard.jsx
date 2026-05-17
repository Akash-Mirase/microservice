/**
 * dashboard/Dashboard.jsx
 *
 * Full-featured React dashboard for self-healing microservices platform
 * Shows: health, metrics, diagnoses, healing actions, alerts
 *
 * To run:
 *   npm install react recharts axios
 *   Create React App or copy this into your React project
 */

import React, { useState, useEffect, useMemo } from 'react'
import axios from 'axios'
import { io } from 'socket.io-client'
import Topology from './topology'
import SystemMetricsChart from './charts/SystemMetricsChart'
import IncidentTimeline from './components/IncidentTimeline'
import RootCausePanel from './components/RootCausePanel'
import AnomalyHeatmap from './components/AnomalyHeatmap'
import SLAPanel from './components/SLAPanel'

const API_BASE = process.env.REACT_APP_API_URL || 'http://localhost:4006'

// ──────────────────────────────────────────────────────
// DASHBOARD
// ──────────────────────────────────────────────────────

export default function Dashboard () {
  const [tab, setTab] = useState('overview')
  const [health, setHealth] = useState([])
  const [diagnoses, setDiagnoses] = useState([])
  const [alerts, setAlerts] = useState([])
  const [loading, setLoading] = useState(true)
  const [incident, setIncident] = useState(null)

  const [events, setEvents] = useState([])

  const [services, setServices] = useState([])
  const [timeline, setTimeline] = useState([])
  const [rootCause, setRootCause] = useState(null)
  const [heatmap, setHeatmap] = useState([])
  const [sla, setSla] = useState(null)
  const [connected, setConnected] = useState(false)

  useEffect(() => {
    const loadDashboardData = async () => {
      try {
        const [eventsRes, rootRes, heatmapRes, slaRes] = await Promise.all([
          axios.get(`${API_BASE}/dashboard/events`),

          axios.get(`${API_BASE}/dashboard/root-cause`),
          axios.get(`${API_BASE}/dashboard/heatmap`),
          axios.get(`${API_BASE}/dashboard/sla`)
        ])

        setTimeline(eventsRes.data)

        setRootCause(rootRes.data)

        setHeatmap(heatmapRes.data)

        setSla(slaRes.data)
      } catch (err) {
        console.error(err)
      }
    }
    const fetchData = async () => {
      try {
        const [healthRes, diagRes, alertRes] = await Promise.all([
          axios.get(`${API_BASE}/dashboard/health`),

          axios.get(`${API_BASE}/diagnoses`).catch(() => ({ data: [] })),

          axios.get(`${API_BASE}/alerts`).catch(() => ({ data: [] }))
        ])

        setHealth(healthRes.data)

        setDiagnoses(diagRes.data)

        setAlerts(alertRes.data)
      } catch (err) {
        console.error('Failed to fetch dashboard data:', err)
      } finally {
        setLoading(false)
      }
    }

    fetchData()
    loadDashboardData()

    const socket = io(API_BASE)
    socket.on('service-update', data => {
      setServices(data)
    })

    socket.on('incident-update', data => {
      setIncident(data)
    })

    socket.on('event-update', data => {
      setEvents(prev => [data, ...prev])
    })
    socket.on('connect', () => {
       setConnected(true)
    })

     socket.on('disconnect', () => {
       setConnected(false)
     })

    const interval = setInterval(() => {
      fetchData()

      loadDashboardData()
    }, 5000)
    return () => {
      socket.disconnect()

      clearInterval(interval)
    }
  }, [])

  const healthyServices = useMemo(
    () => (services.length ? services : health),
    [services, health]
  )

  if (loading) return <LoadingScreen />

  return (
    <div style={styles.container}>
      <Header />
      <div
            style={{
              position: 'fixed',
              top: '20px',
              right: '20px',
              padding: '8px 14px',
              borderRadius: '20px',
              background: connected ? '#27ae60' : '#e74c3c',
              color: 'white',
              fontWeight: 'bold',
              zIndex: 9999,
              boxShadow: '0 2px 8px rgba(0,0,0,0.2)'
              }}
              >
  {connected ? '🟢 LIVE' : '🔴 DISCONNECTED'}
</div>
      <Navigation tab={tab} setTab={setTab} />

      {tab === 'overview' && (
        <>
          <OverviewTab
            health={healthyServices}
            diagnoses={diagnoses}
            alerts={alerts}
          />
          <Topology />

          <SystemMetricsChart />

          <IncidentTimeline timeline={timeline} />

          <RootCausePanel rootCause={rootCause} />

          <AnomalyHeatmap heatmap={heatmap} />

          <SLAPanel sla={sla} />
          <ErrorBoundary>
           <SystemMetricsChart />
          </ErrorBoundary>
        </>
      )}
      {tab === 'metrics' && <MetricsTab health={health} />}
      {tab === 'diagnoses' && <DiagnosesTab diagnoses={diagnoses} />}
      {tab === 'healing' && <HealingTab diagnoses={diagnoses} />}
      {tab === 'alerts' && <AlertsTab alerts={alerts} />}
    </div>
  )
}

// ──────────────────────────────────────────────────────
// TABS
// ──────────────────────────────────────────────────────

function OverviewTab ({ health, diagnoses, alerts }) {
  const healthyCount = health.filter(s => s.status === 'UP').length
  const criticalCount = diagnoses.filter(d => d.severity > 70).length
  const alertCount = alerts.filter(a => a.risk_level === 'CRITICAL').length

  return (
    <div style={styles.tabContent}>
      <div style={styles.grid3}>
        <StatCard
          label='Services Healthy'
          value={`${healthyCount}/${health.length}`}
          color='green'
        />
        <StatCard
          label='Critical Issues'
          value={criticalCount}
          color={criticalCount > 0 ? 'red' : 'green'}
        />
        <StatCard
          label='Predictive Alerts'
          value={alertCount}
          color={alertCount > 0 ? 'amber' : 'green'}
        />
      </div>

      <Section title='Service Health'>
        <ServiceGrid services={health} />
      </Section>

      {diagnoses.length > 0 && (
        <Section title='Active Diagnoses'>
          <DiagnosisGrid diagnoses={diagnoses.slice(0, 5)} />
        </Section>
      )}

      {alerts.length > 0 && (
        <Section title='Predictive Alerts'>
          <AlertGrid alerts={alerts.slice(0, 5)} />
        </Section>
      )}
    </div>
  )
}

function MetricsTab ({ health }) {
  const [selectedService, setSelectedService] = useState(health[0]?.name || '')
  const [metrics, setMetrics] = useState([])

  useEffect(() => {
    if (!selectedService) return
    axios
      .get(`${API_BASE}/dashboard/metrics`, {
        params: { service: selectedService, limit: 50 }
      })
      .then(res => setMetrics(res.data.reverse()))
      .catch(err => console.error('Failed to fetch metrics:', err))
  }, [selectedService])

  useEffect(() => {
    if (!selectedService && health.length > 0) {
      setSelectedService(health[0].name)
    }
  }, [health])

  return (
    <div style={styles.tabContent}>
      <div style={styles.filterBar}>
        <label>Service:</label>
        <select
          value={selectedService}
          onChange={e => setSelectedService(e.target.value)}
          style={styles.select}
        >
          {health.map(s => (
            <option key={s.name || s.service_name} value={s.name || s.service_name}>
              {s.name || s.service_name}
            </option>
          ))}
        </select>
      </div>

      <Section title={`Metrics - ${selectedService}`}>
        <MetricsChart metrics={metrics} />
      </Section>

      <Section title='Raw Data'>
        <table style={styles.table}>
          <thead>
            <tr>
              <th>Time</th>
              <th>CPU %</th>
              <th>Memory %</th>
              <th>Response (ms)</th>
              <th>Errors/min</th>
            </tr>
          </thead>
          <tbody>
            {metrics.slice(-20).map((m, i) => (
              <tr key={i}>
                <td>{new Date(m.created_at).toLocaleTimeString()}</td>
                <td>{m.cpu?.toFixed(1) || 'N/A'}</td>
                <td>{m.memory?.toFixed(1) || 'N/A'}</td>
                <td>{m.response_time || 'N/A'}</td>
                <td>{m.error_rate?.toFixed(2) || 'N/A'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Section>
    </div>
  )
}

function DiagnosesTab ({ diagnoses }) {
  return (
    <div style={styles.tabContent}>
      <Section title='Service Diagnoses'>
        {diagnoses.length === 0 ? (
          <p style={styles.emptyState}>All services operating normally</p>
        ) : (
          <div style={styles.gridSingle}>
            {diagnoses.map(d => (
              <Card key={d.service_name} style={styles.card}>
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'start'
                  }}
                >
                  <div>
                    <h3 style={styles.cardTitle}>{d.service_name}</h3>
                    <Badge label={d.anomaly_type} severity={d.severity} />
                  </div>
                  <Severity level={d.severity} />
                </div>
                <p style={{ ...styles.text, marginTop: '12px', color: '#666' }}>
                  <strong>Root Cause:</strong> {d.root_cause}
                </p>
                <p style={{ ...styles.text, color: '#666' }}>
                  <strong>Recommendation:</strong> {d.recommendation}
                </p>
                <p style={{ ...styles.text, fontSize: '12px', color: '#999' }}>
                  Last updated: {new Date(d.updated_at).toLocaleTimeString()}
                </p>
              </Card>
            ))}
          </div>
        )}
      </Section>
    </div>
  )
}

function HealingTab ({ diagnoses }) {
  const [history, setHistory] = useState([])
  const [selectedService, setSelectedService] = useState(
    diagnoses[0]?.s.name || s.service_name || ''
  )

  useEffect(() => {
    if (!selectedService) return
    axios
      .get(`${API_BASE}/history/${selectedService}`)
      .then(res => setHistory(res.data))
      .catch(() => {})
  }, [selectedService])

  useEffect(() => {
    if (!selectedService && diagnoses.length > 0) {
      setSelectedService(diagnoses[0].s.name || s.service_name)
    }
  }, [diagnoses])

  const handleManualHeal = async service => {
    try {
      const res = await axios.post(`${API_BASE}/heal/${service}`)
      alert(`Healing triggered: ${res.data.actions.length} action(s) taken`)
      setHistory(prev => [
        {
          service: service,
          action_type: 'MANUAL_HEAL',
          created_at: new Date().toISOString()
        },
        ...prev
      ])
    } catch (err) {
      alert('Healing failed: ' + err.message)
    }
  }

  return (
    <div style={styles.tabContent}>
      <div style={styles.filterBar}>
        <label>Service:</label>
        <select
          value={selectedService}
          onChange={e => setSelectedService(e.target.value)}
          style={styles.select}
        >
          {diagnoses.map(d => (
            <option key={d.service_name} value={d.service_name}>
              {d.service_name}
            </option>
          ))}
        </select>
        <button
          style={styles.button}
          onClick={() => handleManualHeal(selectedService)}
        >
          ⚡ Manual Heal
        </button>
      </div>

      <Section title={`Healing History - ${selectedService}`}>
        <table style={styles.table}>
          <thead>
            <tr>
              <th>Time</th>
              <th>Anomaly Type</th>
              <th>Action</th>
              <th>Status</th>
              <th>Message</th>
            </tr>
          </thead>
          <tbody>
            {history.slice(0, 30).map((h, i) => (
              <tr key={i}>
                <td>{new Date(h.created_at).toLocaleTimeString()}</td>
                <td>{h.anomaly_type || '-'}</td>
                <td>
                  <code>{h.action_type}</code>
                </td>
                <td>
                  <Badge
                    label={h.action_status}
                    severity={h.action_status === 'SUCCESS' ? 20 : 50}
                  />
                </td>
                <td style={{ fontSize: '12px', color: '#666' }}>{h.message}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Section>
    </div>
  )
}

function AlertsTab ({ alerts }) {
  return (
    <div style={styles.tabContent}>
      <Section title='Predictive Alerts'>
        {alerts.length === 0 ? (
          <p style={styles.emptyState}>
            No predictive alerts. System trending healthy.
          </p>
        ) : (
          <div style={styles.gridSingle}>
            {alerts.map((a, i) => (
              <Card
                key={i}
                style={{
                  ...styles.card,
                  borderLeft: `4px solid ${getRiskColor(a.risk_level)}`
                }}
              >
                <div
                  style={{ display: 'flex', justifyContent: 'space-between' }}
                >
                  <h3 style={styles.cardTitle}>{a.service}</h3>
                  <Severity level={a.risk_level === 'CRITICAL' ? 90 : 60} />
                </div>
                <p style={{ ...styles.text, marginTop: '8px', color: '#666' }}>
                  <strong>{a.risk_level} Risk:</strong>{' '}
                  {a.ttl_minutes?.toFixed(1)} min to SLA breach
                </p>
                <details style={{ marginTop: '12px' }}>
                  <summary
                    style={{
                      cursor: 'pointer',
                      color: '#0066cc',
                      fontSize: '12px'
                    }}
                  >
                    View forecast
                  </summary>
                  <pre
                    style={{
                      fontSize: '11px',
                      background: '#f5f5f5',
                      padding: '8px',
                      borderRadius: '4px',
                      overflow: 'auto',
                      maxHeight: '200px'
                    }}
                  >
                    {JSON.stringify(a.forecast || a.metric_forecast, null, 2)}
                  </pre>
                </details>
              </Card>
            ))}
          </div>
        )}
      </Section>
    </div>
  )
}

// ──────────────────────────────────────────────────────
// COMPONENTS
// ──────────────────────────────────────────────────────

function Header () {
  return (
    <header style={styles.header}>
      <h1 style={styles.title}>🔧 Self-Healing Microservices Dashboard</h1>
      <p style={styles.subtitle}>
        Real-time monitoring, diagnosis, healing, and predictive alerts
      </p>
    </header>
  )
}

function Navigation ({ tab, setTab }) {
  const tabs = [
    { id: 'overview', label: '📊 Overview' },
    { id: 'metrics', label: '📈 Metrics' },
    { id: 'diagnoses', label: '🔍 Diagnoses' },
    { id: 'healing', label: '⚡ Healing' },
    { id: 'alerts', label: '⚠️ Alerts' }
  ]
  return (
    <nav style={styles.nav}>
      {tabs.map(t => (
        <button
          key={t.id}
          onClick={() => setTab(t.id)}
          style={{
            ...styles.navButton,
            ...(tab === t.id ? styles.navButtonActive : {})
          }}
        >
          {t.label}
        </button>
      ))}
    </nav>
  )
}

function ServiceGrid ({ services }) {
  return (
    <div style={styles.grid}>
      {services.map(s => (
        <Card key={s.name || s.service_name} style={styles.serviceCard}>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center'
            }}
          >
            <h3 style={styles.serviceName}>{s.name || s.service_name}</h3>
            <StatusBadge status={s.status} />
          </div>
          <div style={styles.metricRow}>
            <Metric label='CPU' value={s.cpu} unit='%' />
            <Metric label='Memory' value={s.memory} unit='%' />
            <Metric label='Response' value={s.responseTime} unit='' />
          </div>
          <div style={styles.metricRow}>
            <Metric label='Errors' value={s.errorRate} unit='/min' />
            <Metric label='Requests' value={s.requestCount} unit='' />
            <Metric label='Status' value={s.recovery} unit='' />
          </div>
        </Card>
      ))}
    </div>
  )
}

function DiagnosisGrid ({ diagnoses }) {
  return (
    <div style={styles.grid}>
      {diagnoses.map(d => (
        <Card key={d.service_name} style={styles.card}>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <h4 style={styles.cardTitle}>{d.service_name}</h4>
            <Severity level={d.severity} />
          </div>
          <Badge label={d.anomaly_type} severity={d.severity} />
          <p
            style={{
              ...styles.text,
              fontSize: '12px',
              marginTop: '8px',
              color: '#666'
            }}
          >
            {d.root_cause}
          </p>
        </Card>
      ))}
    </div>
  )
}

function AlertGrid ({ alerts }) {
  return (
    <div style={styles.grid}>
      {alerts.map((a, i) => (
        <Card
          key={i}
          style={{
            ...styles.card,
            borderLeft: `4px solid ${getRiskColor(a.risk_level)}`
          }}
        >
          <h4 style={styles.cardTitle}>{a.service}</h4>
          <Badge
            label={a.risk_level}
            severity={a.risk_level === 'CRITICAL' ? 90 : 60}
          />
          <p style={{ ...styles.text, fontSize: '12px', marginTop: '8px' }}>
            {a.ttl_minutes?.toFixed(1)} min to SLA breach
          </p>
        </Card>
      ))}
    </div>
  )
}

function MetricsChart ({ metrics }) {
  if (metrics.length === 0)
    return <p style={styles.emptyState}>Loading metrics...</p>

  const chartData = metrics.map(m => ({
    time: new Date(m.created_at).toLocaleTimeString(),
    cpu: m.cpu,
    memory: m.memory,
    latency: m.response_time
  }))

  return (
    <div
      style={{
        overflowX: 'auto',
        background: '#f9f9f9',
        padding: '16px',
        borderRadius: '8px'
      }}
    >
      <svg width='100%' height='300' style={{ minWidth: '600px' }}>
        <text x='20' y='25' fontSize='12' fontWeight='bold'>
          CPU & Memory %
        </text>
        {chartData.map((d, i) => {
          const x =
            50 + (i / chartData.length) * (chartData.length > 1 ? 600 : 100)
          const y1 = 250 - d.cpu * 1.5
          const y2 = 250 - d.memory * 1.5
          return (
            <g key={i}>
              <circle cx={x} cy={y1} r='2' fill='#e74c3c' opacity='0.7' />
              <circle cx={x} cy={y2} r='2' fill='#3498db' opacity='0.7' />
            </g>
          )
        })}
        <line
          x1='50'
          y1='250'
          x2='650'
          y2='250'
          stroke='#ccc'
          strokeWidth='1'
        />
        <text x='20' y='270' fontSize='11' fill='#666'>
          Older
        </text>
        <text x='620' y='270' fontSize='11' fill='#666'>
          Newer
        </text>
      </svg>
      <div
        style={{
          display: 'flex',
          gap: '20px',
          marginTop: '12px',
          fontSize: '12px'
        }}
      >
        <div>
          <span
            style={{
              display: 'inline-block',
              width: '10px',
              height: '10px',
              background: '#e74c3c',
              borderRadius: '2px',
              marginRight: '4px'
            }}
          />
          CPU
        </div>
        <div>
          <span
            style={{
              display: 'inline-block',
              width: '10px',
              height: '10px',
              background: '#3498db',
              borderRadius: '2px',
              marginRight: '4px'
            }}
          />
          Memory
        </div>
      </div>
    </div>
  )
}

function StatCard ({ label, value, color }) {
  const colors = { green: '#27ae60', red: '#e74c3c', amber: '#f39c12' }
  return (
    <Card style={styles.statCard}>
      <p style={styles.statLabel}>{label}</p>
      <p style={{ ...styles.statValue, color: colors[color] }}>{value}</p>
    </Card>
  )
}

function Metric ({ label, value, unit }) {
  return (
    <div style={{ flex: 1 }}>
      <p style={styles.metricLabel}>{label}</p>
      <p style={styles.metricValue}>
        {typeof value === 'number' ? value.toFixed(1) : value}
        {unit}
      </p>
    </div>
  )
}

function StatusBadge ({ status }) {
  const colors = { UP: '#27ae60', DOWN: '#e74c3c' }
  return (
    <span style={{ ...styles.badge, background: colors[status] || '#95a5a6' }}>
      {status}
    </span>
  )
}

function Badge ({ label, severity }) {
  const colors = {
    MEMORY_LEAK: '#9b59b6',
    CPU_LEAK: '#e67e22',
    CASCADE_FAILURE: '#e74c3c',
    CACHE_POISON: '#3498db',
    RESOURCE_EXHAUSTION: '#e74c3c',
    SUCCESS: '#27ae60',
    FAILED: '#e74c3c',
    PENDING: '#f39c12',
    CRITICAL: '#e74c3c',
    HIGH: '#f39c12',
    MEDIUM: '#3498db',
    LOW: '#27ae60'
  }
  return (
    <span
      style={{
        ...styles.badge,
        background: colors[label] || '#95a5a6',
        fontSize: '11px',
        padding: '4px 8px',
        marginTop: '8px',
        display: 'inline-block'
      }}
    >
      {label} {severity !== undefined && `(${Number(severity || 0).toFixed(0)}%)`}
    </span>
  )
}

function Severity ({ level }) {
  let icon = '✅'
  if (level > 70) icon = '🔴'
  else if (level > 40) icon = '🟡'
  else if (level > 0) icon = '🟠'
  return <span style={{ fontSize: '24px' }}>{icon}</span>
}

function Section ({ title, children }) {
  return (
    <div style={{ marginTop: '24px' }}>
      <h2 style={styles.sectionTitle}>{title}</h2>
      {children}
    </div>
  )
}

function Card ({ children, style }) {
  return <div style={{ ...styles.card, ...style }}>{children}</div>
}

function LoadingScreen () {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100vh',
        background: '#f5f5f5'
      }}
    >
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: '48px', marginBottom: '16px' }}>⚙️</div>
        <p style={{ fontSize: '18px', color: '#666' }}>Loading dashboard...</p>
      </div>
    </div>
  )
}

// ──────────────────────────────────────────────────────
// STYLES
// ──────────────────────────────────────────────────────

const styles = {
  container: {
    fontFamily: "'Segoe UI', Tahoma, Geneva, Verdana, sans-serif",
    background: '#f5f7fa',
    minHeight: '100vh'
  },
  header: {
    background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
    color: 'white',
    padding: '32px 24px',
    textAlign: 'center'
  },
  title: {
    margin: '0 0 8px',
    fontSize: '28px',
    fontWeight: '600'
  },
  subtitle: {
    margin: '0',
    fontSize: '14px',
    opacity: '0.9'
  },
  nav: {
    display: 'flex',
    gap: '8px',
    padding: '16px 24px',
    background: 'white',
    borderBottom: '1px solid #e0e0e0',
    overflowX: 'auto'
  },
  navButton: {
    padding: '10px 16px',
    border: 'none',
    background: 'transparent',
    cursor: 'pointer',
    fontSize: '14px',
    fontWeight: '500',
    color: '#666',
    whiteSpace: 'nowrap'
  },
  navButtonActive: {
    color: '#667eea',
    borderBottom: '3px solid #667eea'
  },
  tabContent: {
    padding: '24px'
  },
  grid3: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
    gap: '16px',
    marginBottom: '24px'
  },
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))',
    gap: '16px'
  },
  gridSingle: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
    gap: '16px'
  },
  card: {
    background: 'white',
    border: '1px solid #e0e0e0',
    borderRadius: '8px',
    padding: '16px'
  },
  serviceCard: {
    background: 'white',
    border: '1px solid #e0e0e0',
    borderRadius: '8px',
    padding: '16px'
  },
  statCard: {
    background: 'white',
    border: '1px solid #e0e0e0',
    borderRadius: '8px',
    padding: '20px',
    textAlign: 'center'
  },
  statLabel: {
    margin: '0',
    fontSize: '12px',
    color: '#999',
    textTransform: 'uppercase',
    letterSpacing: '0.5px'
  },
  statValue: {
    margin: '8px 0 0',
    fontSize: '32px',
    fontWeight: '600'
  },
  serviceName: {
    margin: '0',
    fontSize: '16px',
    fontWeight: '600'
  },
  cardTitle: {
    margin: '0 0 8px',
    fontSize: '15px',
    fontWeight: '600'
  },
  metricRow: {
    display: 'flex',
    gap: '16px',
    marginTop: '12px'
  },
  metricLabel: {
    margin: '0',
    fontSize: '11px',
    color: '#999',
    textTransform: 'uppercase'
  },
  metricValue: {
    margin: '4px 0 0',
    fontSize: '16px',
    fontWeight: '600',
    color: '#333'
  },
  sectionTitle: {
    margin: '0',
    fontSize: '20px',
    fontWeight: '600',
    color: '#333'
  },
  badge: {
    display: 'inline-block',
    padding: '6px 12px',
    borderRadius: '4px',
    color: 'white',
    fontSize: '12px',
    fontWeight: '500'
  },
  text: {
    margin: '0',
    fontSize: '14px'
  },
  emptyState: {
    textAlign: 'center',
    color: '#999',
    padding: '32px',
    fontSize: '14px'
  },
  filterBar: {
    display: 'flex',
    gap: '12px',
    alignItems: 'center',
    padding: '16px',
    background: 'white',
    borderRadius: '8px',
    marginBottom: '16px'
  },
  select: {
    padding: '8px 12px',
    border: '1px solid #ddd',
    borderRadius: '4px',
    fontSize: '14px',
    cursor: 'pointer'
  },
  button: {
    padding: '8px 16px',
    background: '#667eea',
    color: 'white',
    border: 'none',
    borderRadius: '4px',
    cursor: 'pointer',
    fontSize: '14px',
    fontWeight: '500'
  },
  table: {
    width: '100%',
    borderCollapse: 'collapse',
    fontSize: '13px'
  }
}

function getRiskColor (level) {
  const colors = {
    CRITICAL: '#e74c3c',
    HIGH: '#f39c12',
    MEDIUM: '#3498db',
    LOW: '#27ae60'
  }
  return colors[level] || '#95a5a6'
}
