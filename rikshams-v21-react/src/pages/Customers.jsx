import React from 'react'
import {useNavigate} from 'react-router-dom'
import PageTitle from '../components/PageTitle'
import GenericMaster from '../components/GenericMaster'

export default function Customers(){
 const nav=useNavigate()
 return <>
  <PageTitle title="Customers" subtitle="Individual and corporate customers, order history and balances"/>
  <GenericMaster
   table="customers"
   title="Customers"
   subtitle="Customer master"
   order="name"
   onProfile={r=>nav(`/profiles/customer/${r.id}`)}
   fields={[
    {key:'customer_type',label:'Customer Type',type:'select',options:['Individual','Corporate']},
    {key:'name',label:'Customer / Company Name'},
    {key:'mobile',label:'Mobile'},
    {key:'alternate_phone',label:'Alternate Phone'},
    {key:'business',label:'Business / Category'},
    {key:'area',label:'Area'},
    {key:'address',label:'Address',full:true},
    {key:'billing_name',label:'Billing Name'},
    {key:'tax_id',label:'PAN / Tax ID'},
    {key:'billing_address',label:'Billing Address',type:'textarea',full:true},
    {key:'status',label:'Status',type:'select',options:['Active','Inactive']}
   ]}
   columns={[
    {key:'name',label:'Customer'},
    {key:'customer_type',label:'Type'},
    {key:'mobile',label:'Mobile'},
    {key:'business',label:'Business'},
    {key:'area',label:'Area'},
    {key:'orders',label:'Orders'},
    {key:'total',label:'Total',money:true},
    {key:'outstanding',label:'Outstanding',money:true},
    {key:'status',label:'Status',status:true}
   ]}
   defaultValues={{customer_type:'Individual',status:'Active',orders:0,total:0,received:0,outstanding:0}}
  />
 </>
}
