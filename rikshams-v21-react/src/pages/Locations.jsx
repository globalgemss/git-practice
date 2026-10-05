import React from 'react'
import PageTitle from '../components/PageTitle'
import GenericMaster from '../components/GenericMaster'

export default function Locations(){
 return <>
  <PageTitle title="Location Master" subtitle="Reusable pickup, destination, route-area and zone records"/>
  <GenericMaster
   table="locations"
   title="Locations"
   subtitle="Reusable transport locations"
   order="name"
   fields={[
    {key:'name',label:'Location Name'},
    {key:'area',label:'Area'},
    {key:'zone',label:'Zone'},
    {key:'latitude',label:'Latitude',type:'number'},
    {key:'longitude',label:'Longitude',type:'number'},
    {key:'active',label:'Status',type:'select',options:[{value:true,label:'Active'},{value:false,label:'Inactive'}]}
   ]}
   columns={[
    {key:'name',label:'Location'},
    {key:'area',label:'Area'},
    {key:'zone',label:'Zone'},
    {key:'latitude',label:'Latitude'},
    {key:'longitude',label:'Longitude'},
    {key:'active',label:'Status',render:r=>r.active?'Active':'Inactive'}
   ]}
   statusField="active"
   defaultValues={{active:true}}
  />
 </>
}
