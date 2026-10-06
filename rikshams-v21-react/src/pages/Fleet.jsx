import React,{useState} from 'react'
import {useNavigate,useSearchParams} from 'react-router-dom'
import PageTitle from '../components/PageTitle'
import GenericMaster from '../components/GenericMaster'
import RateMaster from './RateMaster'
import VehicleMaster from './VehicleMaster'

const tabs=['Vehicles','Drivers','Labour','Vehicle Owners','Partners','Rate Master']

export default function Fleet(){
 const nav=useNavigate(),[sp,setSp]=useSearchParams(),[tab,setTab]=useState(()=>tabs.includes(sp.get('tab'))?sp.get('tab'):'Vehicles')
 const changeTab=t=>{setTab(t);const next=new URLSearchParams(sp);next.set('tab',t);setSp(next)}
 return <>
  <PageTitle title="Fleet & Crew" subtitle="Resource master for vehicles, regular drivers, labour, owners, partners and rates"/>
  <div className="master-tabs" role="tablist" aria-label="Fleet & Crew sections">
   {tabs.map(t=><button key={t} role="tab" aria-selected={tab===t} className={tab===t?'active':''} onClick={()=>changeTab(t)}>{t}</button>)}
  </div>

  {tab==='Vehicles'&&<VehicleMaster/>}

  {tab==='Drivers'&&<GenericMaster
    table="drivers"
    title="Drivers"
    subtitle="Driver master, license and availability. Regular vehicle assignment is maintained from Vehicles."
    order="name"
    onProfile={r=>nav(`/profiles/driver/${r.id}`)}
    fields={[
      {key:'name',label:'Driver Name',required:true,group:'Identity & Contact'},
      {key:'mobile',label:'Mobile',group:'Identity & Contact'},
      {key:'alternate_phone',label:'Alternate Phone',group:'Identity & Contact'},
      {key:'address',label:'Address',group:'Identity & Contact'},
      {key:'area',label:'Area',group:'Identity & Contact'},
      {key:'license_no',label:'License Number',group:'License & Verification'},
      {key:'license_expiry',label:'License Expiry',type:'date',group:'License & Verification'},
      {key:'citizenship_no',label:'Citizenship Number',group:'License & Verification'},
      {key:'status',label:'Availability',type:'select',options:['Available','Reserved','Busy','Leave','Off Duty','Inactive'],group:'Operational Status',hint:'Reserved and Busy are normally controlled by Dispatch.'},
      {key:'rating',label:'Rating',type:'number',group:'Performance'},
      {key:'discipline_note',label:'Discipline Note',type:'textarea',full:true,group:'Performance'},
      {key:'reliability_note',label:'Reliability / Honesty Note',type:'textarea',full:true,group:'Performance'},
      {key:'notes',label:'Notes',type:'textarea',full:true,group:'Status & Notes'}
    ]}
    columns={[
      {key:'name',label:'Driver'},
      {key:'mobile',label:'Mobile'},
      {key:'area',label:'Area'},
      {key:'license_no',label:'License'},
      {key:'vehicle_id',label:'Regular Vehicle'},
      {key:'status',label:'Status',status:true},
      {key:'rating',label:'Rating'}
    ]}
    defaultValues={{status:'Available'}}
  />}

  {tab==='Labour'&&<GenericMaster
    table="labourers"
    title="Labour"
    subtitle="Trip-specific labour master, skills, rates and operational availability"
    order="name"
    onProfile={r=>nav(`/profiles/labour/${r.id}`)}
    fields={[
      {key:'name',label:'Name',required:true,group:'Identity & Contact'},
      {key:'mobile',label:'Mobile',group:'Identity & Contact'},
      {key:'alternate_phone',label:'Alternate Phone',group:'Identity & Contact'},
      {key:'address',label:'Address',group:'Identity & Contact'},
      {key:'area',label:'Area',group:'Identity & Contact'},
      {key:'skill',label:'Skill',group:'Operational Details'},
      {key:'rate',label:'Trip Rate',type:'number',group:'Financial Details'},
      {key:'status',label:'Availability',type:'select',options:['Available','Reserved','Busy','Leave','Off Duty','Inactive'],group:'Operational Details',hint:'Reserved and Busy are normally controlled by Dispatch.'},
      {key:'rating',label:'Rating',type:'number',group:'Performance'},
      {key:'discipline_note',label:'Discipline Note',type:'textarea',full:true,group:'Performance'},
      {key:'reliability_note',label:'Reliability / Honesty Note',type:'textarea',full:true,group:'Performance'},
      {key:'notes',label:'Notes',type:'textarea',full:true,group:'Status & Notes'}
    ]}
    columns={[
      {key:'name',label:'Labour'},
      {key:'mobile',label:'Mobile'},
      {key:'area',label:'Area'},
      {key:'skill',label:'Skill'},
      {key:'rate',label:'Rate',money:true},
      {key:'jobs',label:'Jobs'},
      {key:'status',label:'Status',status:true},
      {key:'rating',label:'Rating'}
    ]}
    defaultValues={{status:'Available',rate:0,jobs:0}}
  />}

  {tab==='Vehicle Owners'&&<GenericMaster
    table="vehicle_owners"
    title="Vehicle Owners"
    subtitle="Owner master, contact details and linked vehicle history"
    order="name"
    onProfile={r=>nav(`/profiles/owner/${r.id}`)}
    fields={[
      {key:'name',label:'Name',required:true},
      {key:'mobile',label:'Mobile'},
      {key:'alternate_phone',label:'Alternate Phone'},
      {key:'address',label:'Address'},
      {key:'status',label:'Status',type:'select',options:['Active','Inactive']},
      {key:'notes',label:'Notes',type:'textarea',full:true}
    ]}
    columns={[
      {key:'name',label:'Owner'},
      {key:'mobile',label:'Mobile'},
      {key:'address',label:'Address'},
      {key:'status',label:'Status',status:true}
    ]}
    defaultValues={{status:'Active'}}
  />}

  {tab==='Partners'&&<GenericMaster
    table="partners"
    title="Partners"
    subtitle="Transport partner master, jobs and settlement status"
    order="name"
    onProfile={r=>nav(`/profiles/partner/${r.id}`)}
    fields={[
      {key:'name',label:'Name',required:true},
      {key:'mobile',label:'Mobile'},
      {key:'area',label:'Area'},
      {key:'type',label:'Type'},
      {key:'status',label:'Status',type:'select',options:['Active','Inactive']},
      {key:'notes',label:'Notes',type:'textarea',full:true}
    ]}
    columns={[
      {key:'name',label:'Partner'},
      {key:'mobile',label:'Mobile'},
      {key:'area',label:'Area'},
      {key:'type',label:'Type'},
      {key:'jobs',label:'Jobs'},
      {key:'balance_payable',label:'Payable',money:true},
      {key:'status',label:'Status',status:true}
    ]}
    defaultValues={{status:'Active'}}
  />}

  {tab==='Rate Master'&&<RateMaster/>}
 </>
}
