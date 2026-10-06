import {num} from './format'

const resourceParties=new Set(['Partner','Vehicle Owner','Driver','Labour'])

export const isEffectiveTransaction=t=>t&&t.status!=='Reversed'&&!t.reversal_of
export const activeTransactions=rows=>(rows||[]).filter(isEffectiveTransaction)
export const orderBill=o=>num(o?.final_customer_bill||o?.final_bill||o?.customer_rate)
export const committedResourceCost=o=>num(o?.vehicle_cost)+num(o?.labour_cost)
export const operatingCost=o=>num(o?.operational_extra_cost||o?.other_cost||o?.expense_cost)
export const orderCost=o=>committedResourceCost(o)+operatingCost(o)

export const customerReceipts=(transactions=[],orderId)=>activeTransactions(transactions).filter(t=>t.order_id===orderId&&t.direction==='IN'&&(t.party_type==='Customer'||!t.party_type))
export const resourcePayments=(transactions=[],orderId)=>activeTransactions(transactions).filter(t=>t.order_id===orderId&&t.direction==='OUT'&&resourceParties.has(t.party_type))
export const orderCashPayments=(transactions=[],orderId)=>activeTransactions(transactions).filter(t=>t.order_id===orderId&&t.direction==='OUT')

export function orderFinancial(order,transactions=[]){
  const orderId=order?.id
  const receipts=customerReceipts(transactions,orderId)
  const resourcePaidRows=resourcePayments(transactions,orderId)
  const allPaidRows=orderCashPayments(transactions,orderId)
  const received=receipts.reduce((s,t)=>s+num(t.amount),0)
  const resourcePaid=resourcePaidRows.reduce((s,t)=>s+num(t.amount),0)
  const paid=allPaidRows.reduce((s,t)=>s+num(t.amount),0)
  const bill=orderBill(order)
  const resourceCost=committedResourceCost(order)
  const cost=orderCost(order)
  return {
    bill,
    cost,
    resourceCost,
    operatingCost:operatingCost(order),
    received,
    paid,
    resourcePaid,
    receivable:Math.max(0,bill-received),
    payable:Math.max(0,resourceCost-resourcePaid),
    accruedMargin:bill-cost,
    cashMargin:received-paid,
    customerSettlement:bill<=0?'No Bill':received<=0?'Pending':received+0.0001>=bill?'Paid':'Partial',
    resourceSettlement:resourceCost<=0?'No Payable':resourcePaid<=0?'Unpaid':resourcePaid+0.0001>=resourceCost?'Paid':'Partial'
  }
}

export function portfolioFinancial(orders=[],transactions=[]){
  const activeOrders=(orders||[]).filter(o=>o.status!=='Cancelled')
  const tx=activeTransactions(transactions)
  const bookedRevenue=activeOrders.reduce((s,o)=>s+orderBill(o),0)
  const committedCost=activeOrders.reduce((s,o)=>s+orderCost(o),0)
  const resourceCost=activeOrders.reduce((s,o)=>s+committedResourceCost(o),0)
  const received=tx.filter(t=>t.direction==='IN').reduce((s,t)=>s+num(t.amount),0)
  const paid=tx.filter(t=>t.direction==='OUT').reduce((s,t)=>s+num(t.amount),0)
  const receivable=activeOrders.reduce((s,o)=>s+orderFinancial(o,tx).receivable,0)
  const payable=activeOrders.reduce((s,o)=>s+orderFinancial(o,tx).payable,0)
  return {bookedRevenue,committedCost,resourceCost,accruedMargin:bookedRevenue-committedCost,received,paid,netCash:received-paid,receivable,payable}
}

export function transactionImpact(t){
  if(!isEffectiveTransaction(t))return 0
  return t.direction==='IN'?num(t.amount):-num(t.amount)
}

export function txnDate(t){return String(t?.date||t?.created_at||'').slice(0,10)}
export function movement(rows=[]){const tx=activeTransactions(rows);const receive=tx.filter(t=>t.direction==='IN').reduce((s,t)=>s+num(t.amount),0);const pay=tx.filter(t=>t.direction==='OUT').reduce((s,t)=>s+num(t.amount),0);return {receive,pay,net:receive-pay,count:tx.length}}
