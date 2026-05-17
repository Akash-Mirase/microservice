import React, { useState, useEffect, useRef, useCallback } from 'react'
import axios from 'axios'
import { io } from 'socket.io-client'
import {
  AreaChart, Area, BarChart, Bar,
  XAxis, YAxis, Tooltip, CartesianGrid, ResponsiveContainer, Legend
} from 'recharts'
import ReactFlow, { Background, Controls, MiniMap } from 'reactflow'
import 'reactflow/dist/style.css'

const API = process.env.REACT_APP_API_URL || 'http://localhost:4006'

const C = {
  bg: '#080d18', panel: '#0f1724', border: '#1a2840',
  accent: '#00d4ff', green: '#00ff88', red: '#ff4455',
  amber: '#ffb142', purple: '#a855f7', text: '#dde6f0', muted: '#4a6080',
}

const tt = {
  contentStyle: { background: C.panel, border: `1px solid ${C.border}`, borderRadius: 6, fontSize: 11, color: C.text },
  labelStyle: { color: C.muted }, itemStyle: { color: C.text },
}

function pnl(accent) {
  return { background: C.panel, border: `1px solid ${accent || C.border}`, borderRadius: 8, padding: 20 }
}
function badge(color) {
  return {
    display:'inline-block', padding:'3px 9px', borderRadius:4,
    background:`${color}22`, border:`1px solid ${color}`,
    color, fontSize:10, fontWeight:700, letterSpacing:.5,
  }
}
function btn(color) {
  return {
    padding:'7px 16px', background:`${color||C.accent}22`,
    border:`1px solid ${color||C.accent}`, borderRadius:6,
    color:color||C.accent, fontSize:12, fontWeight:700,
    fontFamily:'inherit', cursor:'pointer', letterSpacing:.5,
  }
}
const sel = {
  padding:'7px 12px', background:C.bg, border:`1px solid ${C.border}`,
  borderRadius:6, color:C.text, fontSize:12, fontFamily:'inherit',
  cursor:'pointer', outline:'none',
}
const th = {
  padding:'10px 12px', textAlign:'left', color:C.muted, fontWeight:600,
  textTransform:'uppercase', letterSpacing:1, fontSize:10,
  borderBottom:`1px solid ${C.border}`,
}
const td = { padding:'9px 12px', borderBottom:`1px solid ${C.border}22`, verticalAlign:'middle', fontSize:12 }
const secTitle = {
  margin:'0 0 16px', fontSize:12, fontWeight:700, color:C.accent,
  textTransform:'uppercase', letterSpacing:2,
  display:'flex', alignItems:'center', justifyContent:'space-between',
}
const logBox = {
  background:C.bg, borderRadius:6, padding:12,
  maxHeight:300, overflowY:'auto', fontSize:11, lineHeight:2,
  fontFamily:'inherit',
}

function statusColor(s) { return s==='UP'?C.green:s==='DOWN'?C.red:C.amber }
function sevColor(n) { const v=parseFloat(n)||0; return v>70?C.red:v>40?C.amber:C.green }
function riskColor(r) { return {CRITICAL:C.red,HIGH:C.amber,MEDIUM:C.accent,LOW:C.green}[r]||C.muted }
function aColor(t) { return {MEMORY_LEAK:C.purple,CPU_LEAK:C.amber,CASCADE_FAILURE:C.red,CACHE_POISON:C.accent,RESOURCE_EXHAUSTION:C.red}[t]||C.muted }
function fmt(v,d=1) { if(v==null) return '—'; if(typeof v==='number') return v.toFixed(d); return String(v) }
function timeAgo(ts) {
  if(!ts) return ''; const s=Math.floor((Date.now()-new Date(ts))/1000)
  if(s<60) return `${s}s ago`; if(s<3600) return `${Math.floor(s/60)}m ago`
  return `${Math.floor(s/3600)}h ago`
}

function ProgressBar({pct,color}) {
  const c=parseFloat(pct)||0, col=c>85?C.red:c>60?C.amber:color||C.green
  return (
    <div style={{height:4,borderRadius:2,background:C.border,overflow:'hidden',marginTop:4}}>
      <div style={{height:'100%',width:`${Math.min(c,100)}%`,background:col,borderRadius:2,transition:'width .5s ease'}}/>
    </div>
  )
}

function SectionTitle({icon,title,extra}) {
  return (
    <div style={secTitle}>
      <span>{icon&&<span style={{marginRight:6}}>{icon}</span>}{title}</span>
      {extra}
    </div>
  )
}

function StatCard({label,value,color,sub}) {
  return (
    <div style={pnl()}>
      <p style={{margin:0,fontSize:10,color:C.muted,textTransform:'uppercase',letterSpacing:1.5}}>{label}</p>
      <p style={{margin:'6px 0 0',fontSize:34,fontWeight:700,color:color||C.text,fontVariantNumeric:'tabular-nums'}}>{value}</p>
      {sub&&<p style={{margin:'4px 0 0',fontSize:10,color:C.muted}}>{sub}</p>}
    </div>
  )
}

export default function Dashboard() {
  const [tab,setTab]=useState('overview')
  const [connected,setConnected]=useState(false)
  const [health,setHealth]=useState([])
  const [services,setServices]=useState([])
  const [diagnoses,setDiagnoses]=useState([])
  const [alerts,setAlerts]=useState([])
  const [timeline,setTimeline]=useState([])
  const [rootCause,setRootCause]=useState(null)
  const [heatmap,setHeatmap]=useState([])
  const [sla,setSla]=useState(null)
  const [incident,setIncident]=useState(null)
  const [liveEvents,setLiveEvents]=useState([])
  const [loading,setLoading]=useState(true)

  const fetchAll=useCallback(async()=>{
    const res=await Promise.allSettled([
      axios.get(`${API}/dashboard/health`),
      axios.get(`${API}/diagnoses`),
      axios.get(`${API}/alerts`),
      axios.get(`${API}/dashboard/events`),
      axios.get(`${API}/dashboard/root-cause`),
      axios.get(`${API}/dashboard/heatmap`),
      axios.get(`${API}/dashboard/sla`),
    ])
    if(res[0].status==='fulfilled') setHealth(res[0].value.data||[])
    if(res[1].status==='fulfilled') setDiagnoses(res[1].value.data||[])
    if(res[2].status==='fulfilled') setAlerts(res[2].value.data||[])
    if(res[3].status==='fulfilled') setTimeline(res[3].value.data||[])
    if(res[4].status==='fulfilled') setRootCause(res[4].value.data)
    if(res[5].status==='fulfilled') setHeatmap(res[5].value.data||[])
    if(res[6].status==='fulfilled') setSla(res[6].value.data)
    setLoading(false)
  },[])

  useEffect(()=>{
    fetchAll()
    const iv=setInterval(fetchAll,8000)
    const socket=io(API,{transports:['websocket','polling']})
    socket.on('connect',()=>setConnected(true))
    socket.on('disconnect',()=>setConnected(false))
    socket.on('service-update',data=>setServices(Array.isArray(data)?data:[]))
    socket.on('incident-update',data=>setIncident(data))
    socket.on('event-update',data=>setLiveEvents(p=>[data,...p].slice(0,100)))
    socket.on('new-event',data=>setLiveEvents(p=>[data,...p].slice(0,100)))
    return()=>{clearInterval(iv);socket.disconnect()}
  },[fetchAll])

  const live=services.length?services:health

  const tabs=[
    {id:'overview',label:'◈ OVERVIEW'},
    {id:'metrics',label:'▲ METRICS'},
    {id:'topology',label:'◎ TOPOLOGY'},
    {id:'diagnoses',label:'⬡ DIAGNOSES'},
    {id:'healing',label:'⟳ HEALING'},
    {id:'alerts',label:'⚠ ALERTS'},
    {id:'logs',label:'≡ LOGS'},
  ]

  if(loading) return (
    <div style={{display:'flex',alignItems:'center',justifyContent:'center',height:'100vh',background:C.bg,flexDirection:'column',gap:16,fontFamily:'JetBrains Mono,Fira Code,monospace'}}>
      <div style={{fontSize:48,animation:'spin 1s linear infinite'}}>⟳</div>
      <p style={{color:C.accent,fontSize:13,letterSpacing:3,margin:0}}>INITIALIZING SYSTEMS...</p>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  )

  return (
    <div style={{fontFamily:'JetBrains Mono,Fira Code,Courier New,monospace',background:C.bg,minHeight:'100vh',color:C.text}}>
      {/* Header */}
      <header style={{background:`linear-gradient(90deg,#080d18 0%,#0d1e35 50%,#080d18 100%)`,borderBottom:`1px solid ${C.border}`,padding:'16px 24px',display:'flex',alignItems:'center',justifyContent:'space-between',position:'sticky',top:0,zIndex:100}}>
        <div style={{display:'flex',alignItems:'center',gap:14}}>
          <span style={{fontSize:28}}>⬡</span>
          <div>
            <p style={{margin:0,fontSize:17,fontWeight:700,color:C.accent,letterSpacing:1}}>SELF-HEALING MICROSERVICES</p>
            <p style={{margin:'2px 0 0',fontSize:11,color:C.muted}}>Detection · Diagnosis · Healing · Prediction</p>
          </div>
        </div>
        <div style={{display:'flex',alignItems:'center',gap:16}}>
          {incident?.active&&(
            <div style={badge(C.red)}>🔴 INCIDENT: {incident.service} › {incident.stage}</div>
          )}
          <div style={{padding:'5px 14px',borderRadius:20,background:connected?'rgba(0,255,136,.15)':'rgba(255,68,85,.15)',border:`1px solid ${connected?C.green:C.red}`,color:connected?C.green:C.red,fontSize:11,fontWeight:700,letterSpacing:1,display:'flex',alignItems:'center',gap:6}}>
            <div style={{width:7,height:7,borderRadius:'50%',background:connected?C.green:C.red,boxShadow:`0 0 6px ${connected?C.green:C.red}`}}/>
            {connected?'LIVE':'OFFLINE'}
          </div>
        </div>
      </header>

      {/* Nav */}
      <nav style={{display:'flex',gap:4,padding:'0 24px',background:C.panel,borderBottom:`1px solid ${C.border}`,overflowX:'auto'}}>
        {tabs.map(t=>(
          <button key={t.id} onClick={()=>setTab(t.id)} style={{padding:'12px 18px',border:'none',background:'transparent',cursor:'pointer',fontSize:12,fontWeight:600,color:tab===t.id?C.accent:C.muted,borderBottom:tab===t.id?`2px solid ${C.accent}`:'2px solid transparent',whiteSpace:'nowrap',fontFamily:'inherit',letterSpacing:.5}}>
            {t.label}
          </button>
        ))}
      </nav>

      {/* Content */}
      <div style={{padding:24}}>
        {tab==='overview'&&<OverviewTab services={live} diagnoses={diagnoses} alerts={alerts} sla={sla} heatmap={heatmap} rootCause={rootCause} timeline={timeline} liveEvents={liveEvents}/>}
        {tab==='metrics'&&<MetricsTab services={live}/>}
        {tab==='topology'&&<TopologyTab services={live}/>}
        {tab==='diagnoses'&&<DiagnosesTab diagnoses={diagnoses}/>}
        {tab==='healing'&&<HealingTab diagnoses={diagnoses} services={live}/>}
        {tab==='alerts'&&<AlertsTab alerts={alerts}/>}
        {tab==='logs'&&<LogsTab liveEvents={liveEvents}/>}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────
function OverviewTab({services,diagnoses,alerts,sla,heatmap,rootCause,timeline,liveEvents}){
  const up=services.filter(s=>s.status==='UP').length
  const crit=diagnoses.filter(d=>parseFloat(d.severity)>70).length
  const alertCrit=alerts.filter(a=>a.risk_level==='CRITICAL').length

  return (
    <div>
      <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(180px,1fr))',gap:16,marginBottom:24}}>
        <StatCard label="Services Online" value={`${up}/${services.length}`} color={up===services.length?C.green:C.amber} sub={`${services.length-up} degraded`}/>
        <StatCard label="Critical Anomalies" value={crit} color={crit>0?C.red:C.green} sub="severity > 70%"/>
        <StatCard label="Predictive Alerts" value={alertCrit} color={alertCrit>0?C.amber:C.green} sub="CRITICAL risk"/>
        <StatCard label="Uptime" value={sla?`${parseFloat(sla.uptime).toFixed(2)}%`:'—'} color={C.accent} sub="current window"/>
        <StatCard label="MTTR" value={sla?.mttr||'—'} color={C.green} sub="mean time to recover"/>
        <StatCard label="Events" value={sla?.incidents??liveEvents.length} color={C.muted} sub="logged"/>
      </div>

      <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(380px,1fr))',gap:20}}>
        {/* Service health */}
        <div style={pnl()}>
          <SectionTitle icon="◈" title="SERVICE HEALTH"/>
          {services.length===0?<p style={{textAlign:'center',color:C.muted,padding:40,fontSize:12}}>Waiting for services...</p>:(
            <div style={{display:'flex',flexDirection:'column',gap:14}}>
              {services.map(s=>{
                const name=s.name||s.service_name, col=statusColor(s.status)
                return (
                  <div key={name}>
                    <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:6}}>
                      <span style={{fontSize:12,fontWeight:600}}>{name}</span>
                      <div style={{display:'flex',gap:8,alignItems:'center'}}>
                        <span style={{fontSize:10,color:C.muted}}>{s.responseTime||''}</span>
                        <span style={badge(col)}>{s.status}</span>
                      </div>
                    </div>
                    <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8}}>
                      <div><div style={{fontSize:10,color:C.muted}}>CPU {fmt(s.cpu)}%</div><ProgressBar pct={s.cpu} color={C.accent}/></div>
                      <div><div style={{fontSize:10,color:C.muted}}>MEM {fmt(s.memory)}%</div><ProgressBar pct={s.memory} color={C.purple}/></div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Heatmap */}
        <div style={pnl()}>
          <SectionTitle icon="⬡" title="ANOMALY HEATMAP"/>
          {(heatmap.length===0&&diagnoses.length===0)?<p style={{textAlign:'center',color:C.muted,padding:40,fontSize:12}}>No anomaly data yet</p>:(
            <div style={{display:'flex',flexDirection:'column',gap:12}}>
              {(heatmap.length?heatmap:diagnoses.map(d=>({service:d.service_name,score:d.severity}))).map(item=>{
                const score=parseFloat(item.score)||0
                const col=score>70?C.red:score>40?C.amber:C.green
                return (
                  <div key={item.service}>
                    <div style={{display:'flex',justifyContent:'space-between',fontSize:11,marginBottom:4}}>
                      <span>{item.service}</span>
                      <span style={{color:col,fontWeight:700}}>{fmt(score,0)}%</span>
                    </div>
                    <ProgressBar pct={score} color={col}/>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Root cause */}
        {rootCause&&rootCause.root_cause&&(
          <div style={pnl(`${C.purple}44`)}>
            <SectionTitle title="ROOT CAUSE ANALYSIS"/>
            <div style={{display:'flex',flexDirection:'column',gap:12}}>
              <div>
                <p style={{fontSize:10,color:C.muted,margin:'0 0 4px',textTransform:'uppercase',letterSpacing:1}}>Cause</p>
                <p style={{fontSize:13,margin:0}}>{rootCause.root_cause}</p>
              </div>
              {rootCause.anomaly_type&&<div><p style={{fontSize:10,color:C.muted,margin:'0 0 4px',textTransform:'uppercase',letterSpacing:1}}>Type</p><span style={badge(aColor(rootCause.anomaly_type))}>{rootCause.anomaly_type}</span></div>}
              {rootCause.recommendation&&<div><p style={{fontSize:10,color:C.muted,margin:'0 0 4px',textTransform:'uppercase',letterSpacing:1}}>Recommendation</p><p style={{fontSize:12,margin:0,lineHeight:1.6,color:C.text}}>{rootCause.recommendation}</p></div>}
              {rootCause.confidence!=null&&<div><p style={{fontSize:10,color:C.muted,margin:'0 0 4px',textTransform:'uppercase',letterSpacing:1}}>Confidence</p><ProgressBar pct={(rootCause.confidence||0)*100} color={C.accent}/><p style={{fontSize:10,color:C.accent,margin:'3px 0 0'}}>{((rootCause.confidence||0)*100).toFixed(0)}%</p></div>}
            </div>
          </div>
        )}

        {/* SLA */}
        {sla&&(
          <div style={pnl()}>
            <SectionTitle title="SLA STATUS"/>
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12}}>
              {[{label:'Uptime',value:`${parseFloat(sla.uptime).toFixed(3)}%`,color:parseFloat(sla.uptime)>99?C.green:C.amber},{label:'MTTR',value:sla.mttr,color:C.accent},{label:'MTBF',value:sla.mtbf,color:C.muted},{label:'Incidents',value:sla.incidents,color:C.muted}].map(item=>(
                <div key={item.label} style={{...pnl(),padding:14}}>
                  <p style={{margin:0,fontSize:10,color:C.muted,textTransform:'uppercase',letterSpacing:1}}>{item.label}</p>
                  <p style={{margin:'4px 0 0',fontSize:20,fontWeight:700,color:item.color}}>{item.value??'—'}</p>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Event logs */}
      {(timeline.length>0||liveEvents.length>0)&&(
        <div style={{...pnl(),marginTop:20}}>
          <SectionTitle title="LIVE EVENT STREAM" extra={<span style={badge(C.green)}>REALTIME</span>}/>
          <div style={logBox}>
            {[...liveEvents,...timeline].slice(0,40).map((ev,i)=>(
              <div key={ev.id||i} style={{display:'flex',gap:12,marginBottom:2}}>
                <span style={{color:C.muted,minWidth:78,fontSize:10}}>{(ev.timestamp||ev.created_at)?new Date(ev.timestamp||ev.created_at).toLocaleTimeString():''}</span>
                <span style={{color:ev.type==='SERVICE_DOWN'?C.red:C.accent,minWidth:120}}>[{ev.type||ev.stage||'EVENT'}]</span>
                <span style={{color:C.amber,minWidth:110}}>{ev.service||ev.service_name||''}</span>
                <span>{ev.message||''}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────
function MetricsTab({services}){
  const names=services.map(s=>s.name||s.service_name).filter(Boolean)
  const [sel2,setSel2]=useState(names[0]||'')
  const [metrics,setMetrics]=useState([])

  useEffect(()=>{if(names.length&&!sel2)setSel2(names[0])},[names.length])
  useEffect(()=>{
    if(!sel2)return
    const load=()=>axios.get(`${API}/dashboard/metrics`,{params:{service:sel2,limit:60}})
      .then(r=>setMetrics((r.data||[]).slice().reverse())).catch(()=>{})
    load()
    const iv=setInterval(load,8000)
    return()=>clearInterval(iv)
  },[sel2])

  const data=metrics.map(m=>({
    time:new Date(m.created_at).toLocaleTimeString(),
    cpu:parseFloat(m.cpu)||0, memory:parseFloat(m.memory)||0,
    latency:parseFloat(m.response_time)||0, errors:parseFloat(m.error_rate)||0,
    requests:parseFloat(m.request_count)||0,
  }))
  const lat=data[data.length-1]||{}

  const gradDefs=(
    <defs>
      <linearGradient id="gcpu" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor={C.accent} stopOpacity={0.3}/><stop offset="95%" stopColor={C.accent} stopOpacity={0}/></linearGradient>
      <linearGradient id="gmem" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor={C.purple} stopOpacity={0.3}/><stop offset="95%" stopColor={C.purple} stopOpacity={0}/></linearGradient>
      <linearGradient id="glat" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor={C.green} stopOpacity={0.3}/><stop offset="95%" stopColor={C.green} stopOpacity={0}/></linearGradient>
      <linearGradient id="greq" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor={C.amber} stopOpacity={0.3}/><stop offset="95%" stopColor={C.amber} stopOpacity={0}/></linearGradient>
    </defs>
  )

  return (
    <div>
      <div style={{...pnl(),marginBottom:20,display:'flex',gap:14,alignItems:'center',flexWrap:'wrap'}}>
        <span style={{fontSize:11,color:C.muted,textTransform:'uppercase',letterSpacing:1}}>Service</span>
        <select style={sel} value={sel2} onChange={e=>setSel2(e.target.value)}>
          {names.map(n=><option key={n} value={n}>{n}</option>)}
        </select>
        <div style={{marginLeft:'auto',display:'flex',gap:24}}>
          {[{label:'CPU',val:`${fmt(lat.cpu)}%`,color:C.accent},{label:'MEM',val:`${fmt(lat.memory)}%`,color:C.purple},{label:'P50',val:`${fmt(lat.latency,0)}ms`,color:C.green},{label:'ERR',val:fmt(lat.errors),color:C.red}].map(x=>(
            <div key={x.label} style={{textAlign:'center'}}>
              <p style={{margin:0,fontSize:9,color:C.muted,textTransform:'uppercase',letterSpacing:1.5}}>{x.label}</p>
              <p style={{margin:'2px 0 0',fontSize:18,fontWeight:700,color:x.color,fontVariantNumeric:'tabular-nums'}}>{x.val}</p>
            </div>
          ))}
        </div>
      </div>

      <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(380px,1fr))',gap:20}}>
        <div style={pnl()}>
          <SectionTitle title="CPU & MEMORY %"/>
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart data={data} margin={{top:5,right:10,bottom:0,left:-10}}>
              {gradDefs}
              <CartesianGrid strokeDasharray="3 3" stroke={C.border}/>
              <XAxis dataKey="time" tick={{fontSize:9,fill:C.muted}} interval="preserveStartEnd"/>
              <YAxis domain={[0,100]} tick={{fontSize:9,fill:C.muted}}/>
              <Tooltip {...tt}/>
              <Legend wrapperStyle={{fontSize:11}}/>
              <Area type="monotone" dataKey="cpu" stroke={C.accent} fill="url(#gcpu)" strokeWidth={2} dot={false} name="CPU %"/>
              <Area type="monotone" dataKey="memory" stroke={C.purple} fill="url(#gmem)" strokeWidth={2} dot={false} name="Memory %"/>
            </AreaChart>
          </ResponsiveContainer>
        </div>

        <div style={pnl()}>
          <SectionTitle title="RESPONSE TIME (ms)"/>
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart data={data} margin={{top:5,right:10,bottom:0,left:-10}}>
              {gradDefs}
              <CartesianGrid strokeDasharray="3 3" stroke={C.border}/>
              <XAxis dataKey="time" tick={{fontSize:9,fill:C.muted}} interval="preserveStartEnd"/>
              <YAxis tick={{fontSize:9,fill:C.muted}}/>
              <Tooltip {...tt}/>
              <Area type="monotone" dataKey="latency" stroke={C.green} fill="url(#glat)" strokeWidth={2} dot={false} name="Latency ms"/>
            </AreaChart>
          </ResponsiveContainer>
        </div>

        <div style={pnl()}>
          <SectionTitle title="ERROR RATE"/>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={data} margin={{top:5,right:10,bottom:0,left:-10}}>
              <CartesianGrid strokeDasharray="3 3" stroke={C.border}/>
              <XAxis dataKey="time" tick={{fontSize:9,fill:C.muted}} interval="preserveStartEnd"/>
              <YAxis tick={{fontSize:9,fill:C.muted}}/>
              <Tooltip {...tt}/>
              <Bar dataKey="errors" fill={C.red} name="Error Rate" radius={[2,2,0,0]}/>
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div style={pnl()}>
          <SectionTitle title="REQUEST COUNT"/>
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart data={data} margin={{top:5,right:10,bottom:0,left:-10}}>
              {gradDefs}
              <CartesianGrid strokeDasharray="3 3" stroke={C.border}/>
              <XAxis dataKey="time" tick={{fontSize:9,fill:C.muted}} interval="preserveStartEnd"/>
              <YAxis tick={{fontSize:9,fill:C.muted}}/>
              <Tooltip {...tt}/>
              <Area type="monotone" dataKey="requests" stroke={C.amber} fill="url(#greq)" strokeWidth={2} dot={false} name="Requests"/>
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div style={{...pnl(),marginTop:20}}>
        <SectionTitle title="RAW DATA"/>
        <div style={{overflowX:'auto'}}>
          <table style={{width:'100%',borderCollapse:'collapse',fontSize:12}}>
            <thead><tr>{['Time','CPU %','Memory %','Response ms','Errors','Requests'].map(h=><th key={h} style={th}>{h}</th>)}</tr></thead>
            <tbody>
              {data.slice(-20).reverse().map((m,i)=>(
                <tr key={i} style={{background:i%2===0?'transparent':`${C.border}22`}}>
                  <td style={td}>{m.time}</td>
                  <td style={{...td,color:m.cpu>80?C.red:C.text}}>{fmt(m.cpu)}%</td>
                  <td style={{...td,color:m.memory>80?C.red:C.text}}>{fmt(m.memory)}%</td>
                  <td style={{...td,color:m.latency>2000?C.amber:C.text}}>{fmt(m.latency,0)}</td>
                  <td style={{...td,color:m.errors>0?C.red:C.muted}}>{fmt(m.errors)}</td>
                  <td style={td}>{fmt(m.requests,0)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────
function TopologyTab({services}){
  const sMap={}; services.forEach(s=>{sMap[s.name||s.service_name]=s})
  const nc=(name)=>{const s=sMap[name];return s?statusColor(s.status):C.muted}

  const makeNode=(id,label,x,y)=>({
    id, position:{x,y},
    data:{label:(
      <div style={{textAlign:'center',fontSize:10}}>
        <div style={{fontSize:14,marginBottom:2,color:nc(label)}}>●</div>
        <div style={{fontWeight:700,fontSize:11}}>{label}</div>
        {sMap[label]&&<div style={{fontSize:9,color:'#aaa',marginTop:2}}>CPU {fmt(sMap[label].cpu)}% · MEM {fmt(sMap[label].memory)}%</div>}
      </div>
    )},
    style:{background:C.panel,border:`2px solid ${nc(label)}`,color:C.text,borderRadius:8,padding:'10px 14px',fontSize:12,width:150,boxShadow:`0 0 16px ${nc(label)}33`}
  })

  const nodes=[
    makeNode('gw','api-gateway',310,20),
    makeNode('auth','auth-service',60,170),
    makeNode('user','user-service',250,170),
    makeNode('order','order-service',460,170),
    makeNode('pay','payment-service',170,330),
    makeNode('notif','notification-service',400,330),
    makeNode('monitor','monitoring-service',640,170),
    makeNode('ml','ml-service',640,330),
  ]
  const edges=[
    {id:'e1',source:'gw',target:'auth',animated:true,style:{stroke:C.border}},
    {id:'e2',source:'gw',target:'user',animated:true,style:{stroke:C.border}},
    {id:'e3',source:'gw',target:'order',animated:true,style:{stroke:C.border}},
    {id:'e4',source:'order',target:'pay',animated:true,style:{stroke:C.amber}},
    {id:'e5',source:'order',target:'notif',animated:true,style:{stroke:C.muted}},
    {id:'e6',source:'monitor',target:'ml',animated:true,style:{stroke:C.accent}},
  ]

  return (
    <div style={pnl()}>
      <SectionTitle icon="◎" title="SERVICE TOPOLOGY" extra={
        <div style={{display:'flex',gap:16,fontSize:10}}>
          <span style={{color:C.green}}>● UP</span>
          <span style={{color:C.red}}>● DOWN</span>
          <span style={{color:C.amber}}>● DEGRADED</span>
          <span style={{color:C.muted}}>● UNKNOWN</span>
        </div>
      }/>
      <div style={{height:520,borderRadius:6,overflow:'hidden',border:`1px solid ${C.border}`}}>
        <ReactFlow nodes={nodes} edges={edges} fitView>
          <Background color={C.border} gap={20}/>
          <Controls style={{background:C.panel,border:`1px solid ${C.border}`}}/>
          <MiniMap style={{background:C.panel,border:`1px solid ${C.border}`}} nodeColor={n=>nc(n.id)}/>
        </ReactFlow>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────
function DiagnosesTab({diagnoses}){
  return (
    <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(320px,1fr))',gap:16}}>
      {diagnoses.length===0?(
        <div style={pnl()}><p style={{textAlign:'center',color:C.muted,padding:40,fontSize:12}}>✓ All services operating normally</p></div>
      ):diagnoses.map(d=>{
        const sev=parseFloat(d.severity)||0,col=sevColor(sev)
        return (
          <div key={d.service_name} style={{...pnl(),borderLeft:`3px solid ${col}`}}>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:12}}>
              <div>
                <p style={{margin:'0 0 8px',fontSize:14,fontWeight:700}}>{d.service_name}</p>
                <span style={badge(aColor(d.anomaly_type))}>{d.anomaly_type||'UNKNOWN'}</span>
              </div>
              <div style={{textAlign:'right'}}>
                <p style={{margin:0,fontSize:28,fontWeight:700,color:col,fontVariantNumeric:'tabular-nums'}}>{fmt(sev,0)}%</p>
                <p style={{margin:0,fontSize:9,color:C.muted,textTransform:'uppercase',letterSpacing:1}}>severity</p>
              </div>
            </div>
            <ProgressBar pct={sev} color={col}/>
            {d.root_cause&&<div style={{marginTop:12}}><p style={{fontSize:10,color:C.muted,margin:'0 0 4px',textTransform:'uppercase',letterSpacing:1}}>Root Cause</p><p style={{fontSize:12,margin:0,lineHeight:1.6}}>{d.root_cause}</p></div>}
            {d.recommendation&&<div style={{marginTop:10}}><p style={{fontSize:10,color:C.muted,margin:'0 0 4px',textTransform:'uppercase',letterSpacing:1}}>Recommendation</p><p style={{fontSize:12,margin:0,color:C.accent,lineHeight:1.6}}>{d.recommendation}</p></div>}
            <p style={{margin:'10px 0 0',fontSize:9,color:C.muted,textTransform:'uppercase',letterSpacing:1}}>{timeAgo(d.created_at||d.updated_at)}</p>
          </div>
        )
      })}
    </div>
  )
}

// ─────────────────────────────────────────────────────
function HealingTab({diagnoses,services}){
  const allNames=[...new Set([...diagnoses.map(d=>d.service_name),...services.map(s=>s.name||s.service_name)].filter(Boolean))]
  const [sel2,setSel2]=useState(allNames[0]||'')
  const [history,setHistory]=useState([])
  const [healing,setHealing]=useState(false)
  const [msg,setMsg]=useState('')

  useEffect(()=>{if(allNames.length&&!sel2)setSel2(allNames[0])},[allNames.length])
  useEffect(()=>{
    if(!sel2)return
    const load=()=>axios.get(`${API}/history/${sel2}`).then(r=>setHistory(r.data||[])).catch(()=>{})
    load(); const iv=setInterval(load,8000); return()=>clearInterval(iv)
  },[sel2])

  const manualHeal=async()=>{
    setHealing(true);setMsg('')
    try{
      const r=await axios.post(`${API}/heal/${sel2}`)
      setMsg(`✓ ${r.data?.actions?.length||0} action(s) triggered`)
      setTimeout(()=>axios.get(`${API}/history/${sel2}`).then(r=>setHistory(r.data||[])),2000)
    }catch(e){setMsg(`✗ ${e.message}`)}
    setHealing(false)
  }

  const diag=diagnoses.find(d=>d.service_name===sel2)

  return (
    <div>
      <div style={{...pnl(),marginBottom:20,display:'flex',gap:14,alignItems:'center',flexWrap:'wrap'}}>
        <span style={{fontSize:11,color:C.muted,textTransform:'uppercase',letterSpacing:1}}>Service</span>
        <select style={sel} value={sel2} onChange={e=>setSel2(e.target.value)}>
          {allNames.map(n=><option key={n} value={n}>{n}</option>)}
        </select>
        <button style={btn(C.red)} onClick={manualHeal} disabled={healing}>
          {healing?'⟳ HEALING...':'⟳ MANUAL HEAL'}
        </button>
        {msg&&<span style={{fontSize:12,color:msg.startsWith('✓')?C.green:C.red}}>{msg}</span>}
      </div>

      {diag&&(
        <div style={{...pnl(`${sevColor(diag.severity)}44`),marginBottom:20}}>
          <SectionTitle title="CURRENT DIAGNOSIS"/>
          <div style={{display:'flex',gap:20,flexWrap:'wrap'}}>
            <div><p style={{fontSize:10,color:C.muted,margin:'0 0 6px',textTransform:'uppercase',letterSpacing:1}}>Type</p><span style={badge(aColor(diag.anomaly_type))}>{diag.anomaly_type}</span></div>
            <div><p style={{fontSize:10,color:C.muted,margin:'0 0 4px',textTransform:'uppercase',letterSpacing:1}}>Severity</p><p style={{margin:0,fontSize:24,fontWeight:700,color:sevColor(diag.severity)}}>{fmt(parseFloat(diag.severity),0)}%</p></div>
            {diag.root_cause&&<div style={{flex:1,minWidth:200}}><p style={{fontSize:10,color:C.muted,margin:'0 0 4px',textTransform:'uppercase',letterSpacing:1}}>Root Cause</p><p style={{fontSize:12,margin:0,lineHeight:1.5}}>{diag.root_cause}</p></div>}
          </div>
        </div>
      )}

      <div style={pnl()}>
        <SectionTitle title={`HEALING HISTORY — ${sel2}`}/>
        {history.length===0?<p style={{textAlign:'center',color:C.muted,padding:40,fontSize:12}}>No healing actions recorded.</p>:(
          <div style={{overflowX:'auto'}}>
            <table style={{width:'100%',borderCollapse:'collapse',fontSize:12}}>
              <thead><tr>{['Time','Anomaly Type','Action','Status','Message'].map(h=><th key={h} style={th}>{h}</th>)}</tr></thead>
              <tbody>
                {history.slice(0,40).map((h,i)=>(
                  <tr key={i} style={{background:i%2===0?'transparent':`${C.border}22`}}>
                    <td style={td}>{h.created_at?new Date(h.created_at).toLocaleTimeString():'—'}</td>
                    <td style={td}><span style={badge(aColor(h.anomaly_type))}>{h.anomaly_type||'—'}</span></td>
                    <td style={{...td,color:C.accent,fontSize:11}}>{h.action_type}</td>
                    <td style={td}><span style={badge(h.action_status==='SUCCESS'?C.green:h.action_status==='FAILED'?C.red:C.amber)}>{h.action_status}</span></td>
                    <td style={{...td,fontSize:11,color:C.muted}}>{h.message}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────
function AlertsTab({alerts}){
  const [all,setAll]=useState(alerts)
  useEffect(()=>{
    const load=()=>axios.get(`${API}/alerts`).then(r=>setAll(r.data||[])).catch(()=>{})
    load(); const iv=setInterval(load,10000); return()=>clearInterval(iv)
  },[])

  return (
    <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(320px,1fr))',gap:16}}>
      {all.length===0?(
        <div style={pnl()}><p style={{textAlign:'center',color:C.muted,padding:40,fontSize:12}}>✓ No predictive alerts. All services trending healthy.</p></div>
      ):all.map((a,i)=>{
        const col=riskColor(a.risk_level)
        let forecast=a.metric_forecast
        if(typeof forecast==='string'){try{forecast=JSON.parse(forecast)}catch(_){forecast=null}}
        return (
          <div key={i} style={{...pnl(),borderTop:`3px solid ${col}`}}>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:12}}>
              <div>
                <p style={{margin:'0 0 8px',fontSize:14,fontWeight:700}}>{a.service_name||a.service}</p>
                <span style={badge(col)}>{a.risk_level}</span>
              </div>
              <div style={{textAlign:'right'}}>
                <p style={{margin:0,fontSize:26,fontWeight:700,color:col}}>{parseFloat(a.ttl_minutes||0).toFixed(1)}</p>
                <p style={{margin:0,fontSize:9,color:C.muted,textTransform:'uppercase',letterSpacing:1}}>min to breach</p>
              </div>
            </div>
            {Array.isArray(forecast)&&forecast.map((f,fi)=>(
              <div key={fi} style={{marginTop:8,padding:'8px 10px',background:C.bg,borderRadius:4}}>
                <div style={{display:'flex',justifyContent:'space-between',marginBottom:4}}>
                  <span style={{fontSize:10,color:C.muted,textTransform:'uppercase'}}>{f.metric}</span>
                  <span style={{fontSize:10,color:col}}>{f.riskLevel}</span>
                </div>
                <div style={{fontSize:11}}>{f.current} → <span style={{color:col}}>{fmt(parseFloat(f.forecast||0),1)}</span><span style={{color:C.muted}}> in {f.minutesToSLA}min</span></div>
              </div>
            ))}
            <p style={{margin:'10px 0 0',fontSize:9,color:C.muted,textTransform:'uppercase',letterSpacing:1}}>{timeAgo(a.created_at)}</p>
          </div>
        )
      })}
    </div>
  )
}

// ─────────────────────────────────────────────────────
function LogsTab({liveEvents}){
  const [logs,setLogs]=useState([])
  const [level,setLevel]=useState('')
  const [svc,setSvc]=useState('')

  const fetchLogs=useCallback(()=>{
    const params={limit:200}
    if(level)params.level=level
    if(svc)params.service=svc
    axios.get(`${API}/dashboard/logs`,{params}).then(r=>setLogs(r.data||[])).catch(()=>{})
  },[level,svc])

  useEffect(()=>{fetchLogs(); const iv=setInterval(fetchLogs,5000); return()=>clearInterval(iv)},[fetchLogs])

  const lCol=(l)=>({ERROR:C.red,WARN:C.amber,INFO:C.accent}[l]||C.muted)
  const svcs=[...new Set(logs.map(l=>l.service_name).filter(Boolean))]

  return (
    <div>
      <div style={{...pnl(),marginBottom:16,display:'flex',gap:12,alignItems:'center',flexWrap:'wrap'}}>
        <span style={{fontSize:11,color:C.muted}}>FILTER</span>
        <select style={sel} value={level} onChange={e=>setLevel(e.target.value)}>
          <option value="">All Levels</option>
          <option value="ERROR">ERROR</option>
          <option value="WARN">WARN</option>
          <option value="INFO">INFO</option>
        </select>
        <select style={sel} value={svc} onChange={e=>setSvc(e.target.value)}>
          <option value="">All Services</option>
          {svcs.map(s=><option key={s} value={s}>{s}</option>)}
        </select>
        <div style={{marginLeft:'auto',display:'flex',gap:10}}>
          <span style={badge(C.red)}>ERR {logs.filter(l=>l.level==='ERROR').length}</span>
          <span style={badge(C.amber)}>WARN {logs.filter(l=>l.level==='WARN').length}</span>
          <span style={badge(C.accent)}>INFO {logs.filter(l=>l.level==='INFO').length}</span>
        </div>
      </div>

      {liveEvents.length>0&&(
        <div style={{...pnl(),marginBottom:16}}>
          <SectionTitle title="LIVE STREAM" extra={<span style={badge(C.green)}>SOCKET</span>}/>
          <div style={{...logBox,maxHeight:180}}>
            {liveEvents.slice(0,20).map((ev,i)=>(
              <div key={i}>
                <span style={{color:C.muted}}>{ev.timestamp?new Date(ev.timestamp).toLocaleTimeString():''} </span>
                <span style={{color:ev.type==='SERVICE_DOWN'?C.red:C.accent}}>[{ev.type}] </span>
                <span style={{color:C.amber}}>{ev.service} </span>
                <span>{ev.message}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div style={pnl()}>
        <SectionTitle title="SYSTEM LOGS" extra={<span style={{fontSize:10,color:C.muted}}>{logs.length} entries</span>}/>
        <div style={{...logBox,maxHeight:500}}>
          {logs.length===0?<p style={{textAlign:'center',color:C.muted,padding:20,fontSize:12}}>No logs found.</p>:logs.map((l,i)=>(
            <div key={l.id||i} style={{display:'flex',gap:10,marginBottom:2}}>
              <span style={{color:C.muted,minWidth:72,fontSize:10}}>{l.created_at?new Date(l.created_at).toLocaleTimeString():''}</span>
              <span style={{color:lCol(l.level),minWidth:38,fontWeight:700,fontSize:10}}>{l.level}</span>
              <span style={{color:C.amber,minWidth:120,fontSize:10}}>{l.service_name}</span>
              <span style={{fontSize:11,flex:1}}>{l.message}</span>
              {l.context&&l.context!=='{}'&&<span style={{fontSize:10,color:C.muted}}>{typeof l.context==='object'?JSON.stringify(l.context):l.context}</span>}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}