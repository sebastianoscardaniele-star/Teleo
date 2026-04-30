import React, { useEffect, useMemo, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { createClient } from '@supabase/supabase-js'
import './styles.css'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || ''
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || ''
const supabase = supabaseUrl && supabaseAnonKey ? createClient(supabaseUrl, supabaseAnonKey) : null
const ADMIN_PASSWORD = 'Sebastian2885-'
const CATEGORIES = ['Películas','Libros','Series','Aplicaciones','Restaurantes']

type Review = { id:number; title:string; description:string; category:string; rating:number; price:string|null; address:string|null; is_hidden:boolean; created_at:string; photos?:Photo[]; comments?:Comment[] }
type Photo = { id:number; review_id:number; image_url:string; sort_order:number }
type Comment = { id:number; review_id:number; content:string; is_hidden:boolean; created_at:string }

function Stars({ value, onChange }:{ value:number; onChange?:(n:number)=>void }){
  return <span>{[1,2,3,4,5].map(n => onChange ? <button key={n} type="button" className={n<=value?'starButton active':'starButton'} onClick={()=>onChange(n)}>★</button> : <span key={n} className="stars">{n<=value?'★':'☆'}</span>)}</span>
}

function App(){
  const [view,setView]=useState<'home'|'reviews'|'create'|'admin'>('home')
  const [reviews,setReviews]=useState<Review[]>([])
  const [loading,setLoading]=useState(false)
  const [message,setMessage]=useState('')
  const [error,setError]=useState('')
  const [admin,setAdmin]=useState(false)

  async function load(){
    setError('')
    if(!supabase){ setReviews([]); setError('Faltan variables VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY en Vercel.'); return }
    const { data: rev, error: revErr } = await supabase.from('reviews').select('*').order('created_at',{ascending:false})
    if(revErr){ setError('Error cargando reseñas: '+revErr.message); return }
    const { data: photos } = await supabase.from('review_photos').select('*').order('sort_order',{ascending:true})
    const { data: comments } = await supabase.from('comments').select('*').order('created_at',{ascending:true})
    const mapped = (rev||[]).map(r=>({ ...r, photos:(photos||[]).filter(p=>p.review_id===r.id), comments:(comments||[]).filter(c=>c.review_id===r.id) }))
    setReviews(mapped)
  }
  useEffect(()=>{ load() },[])

  const visibleReviews = reviews.filter(r=>!r.is_hidden)
  const topByCategory = useMemo(()=>CATEGORIES.map(cat=>visibleReviews.filter(r=>r.category===cat).sort((a,b)=>b.rating-a.rating)[0]).filter(Boolean) as Review[],[visibleReviews])

  async function createReview(e:React.FormEvent<HTMLFormElement>){
    e.preventDefault(); setError(''); setMessage(''); setLoading(true)
    try{
      if(!supabase) throw new Error('Supabase no está conectado. Revisá variables en Vercel.')
      const form = new FormData(e.currentTarget)
      const title = String(form.get('title')||'').trim()
      const description = String(form.get('description')||'').trim()
      const category = String(form.get('category')||'')
      const rating = Number(form.get('rating')||0)
      const price = String(form.get('price')||'').trim() || null
      const address = String(form.get('address')||'').trim() || null
      const fileInput = e.currentTarget.elements.namedItem('photos') as HTMLInputElement
      const files = Array.from(fileInput.files || [])
      if(!title || !description || !category || rating<1) throw new Error('Completá título, descripción, categoría y estrellas.')
      if(files.length < 1) throw new Error('Subí al menos 1 foto.')
      if(files.length > 10) throw new Error('Máximo 10 fotos.')
      const { data: inserted, error: insertErr } = await supabase.from('reviews').insert({title,description,category,rating,price,address}).select().single()
      if(insertErr) throw insertErr
      const urls:string[]=[]
      for(const file of files){
        const safeName = file.name.normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-zA-Z0-9._-]/g,'-')
        const path = `reviews/${inserted.id}/${Date.now()}-${Math.random().toString(36).slice(2)}-${safeName}`
        const { error: upErr } = await supabase.storage.from('review-photos').upload(path,file,{upsert:false,contentType:file.type || 'image/jpeg'})
        if(upErr) throw new Error('No se pudo subir la imagen a Storage: '+upErr.message)
        const { data } = supabase.storage.from('review-photos').getPublicUrl(path)
        urls.push(data.publicUrl)
      }
      const rows = urls.map((url,i)=>({review_id:inserted.id,image_url:url,sort_order:i}))
      const { error: photoErr } = await supabase.from('review_photos').insert(rows)
      if(photoErr) throw photoErr
      e.currentTarget.reset(); setMessage('Reseña publicada con imagen real.'); setView('reviews'); await load()
    }catch(err){ setError(err instanceof Error ? err.message : 'Error desconocido') }
    setLoading(false)
  }

  async function addComment(reviewId:number, form:HTMLFormElement){
    setError('')
    try{ if(!supabase) throw new Error('Supabase no conectado')
      const fd = new FormData(form); const content=String(fd.get('comment')||'').trim(); if(!content) return
      const { error } = await supabase.from('comments').insert({review_id:reviewId,content})
      if(error) throw error; form.reset(); await load()
    }catch(err){ setError(err instanceof Error ? err.message : 'Error al comentar') }
  }
  async function hideReview(id:number,hidden:boolean){ if(!supabase)return; await supabase.from('reviews').update({is_hidden:hidden}).eq('id',id); await load() }
  async function deleteReview(id:number){ if(!supabase)return; await supabase.from('reviews').delete().eq('id',id); await load() }
  async function hideComment(id:number,hidden:boolean){ if(!supabase)return; await supabase.from('comments').update({is_hidden:hidden}).eq('id',id); await load() }
  async function deleteEverything(){ if(!supabase)return; if(!confirm('¿Borrar todas las reseñas y comentarios?'))return; await supabase.from('comments').delete().gte('id',0); await supabase.from('review_photos').delete().gte('id',0); await supabase.from('reviews').delete().gte('id',0); await load() }

  function ReviewCard({r,adminMode=false}:{r:Review;adminMode?:boolean}){
    const firstPhoto = r.photos?.[0]?.image_url
    return <article className="card">
      {firstPhoto ? <img className="photo" src={firstPhoto} alt={r.title} onError={(ev)=>{(ev.currentTarget as HTMLImageElement).style.display='none'}}/> : <div className="empty-photo">Sin foto visible</div>}
      <div className="content">
        <div className="row"><span className="tag">{r.category}</span><Stars value={r.rating}/></div>
        <h2>{r.title}</h2><p>{r.description}</p>{r.price&&<p className="muted">{r.price}</p>}{r.address&&<p className="muted">{r.address}</p>}
        {adminMode && <div className="row" style={{justifyContent:'flex-start',marginTop:12}}><button className="btn light" onClick={()=>hideReview(r.id,!r.is_hidden)}>{r.is_hidden?'Restaurar':'Ocultar'}</button><button className="btn warn" onClick={()=>deleteReview(r.id)}>Eliminar</button></div>}
        <div className="comments"><b>Comentarios</b>{(r.comments||[]).filter(c=>adminMode||!c.is_hidden).map(c=><div className="comment" key={c.id}>{c.content}{adminMode&&<div style={{marginTop:8}}><button className="btn light" onClick={()=>hideComment(c.id,!c.is_hidden)}>{c.is_hidden?'Restaurar':'Ocultar'}</button></div>}</div>)}
          {!adminMode&&<form onSubmit={(e)=>{e.preventDefault();addComment(r.id,e.currentTarget)}} className="row"><input name="comment" placeholder="Escribí un comentario"/><button className="btn">Enviar</button></form>}
        </div>
      </div>
    </article>
  }

  return <main className="app"><header className="top"><div className="brand"><h1>Club de Reseñas</h1><div className="version">versión limpia sin demo + storage real</div></div><nav className="nav"><button className="btn light" onClick={()=>setView('home')}>Inicio</button><button className="btn light" onClick={()=>setView('reviews')}>Reseñas</button><button className="btn" onClick={()=>setView('create')}>Crear reseña</button><button className="btn light" onClick={()=>setView('admin')}>Administrador</button></nav></header>{error&&<p className="error">{error}</p>}{message&&<p className="success">{message}</p>}
    {view==='home'&&<><section className="hero"><h2>Lo mejor de cada categoría</h2><p>Sin reseñas demo. Todo lo que aparece viene de Supabase.</p></section>{topByCategory.length?<div className="grid">{topByCategory.map(r=><ReviewCard key={r.id} r={r}/>)}</div>:<p className="muted">Todavía no hay reseñas publicadas.</p>}</>}
    {view==='reviews'&&<><h2>Todas las reseñas</h2>{visibleReviews.length?<div className="grid">{visibleReviews.map(r=><ReviewCard key={r.id} r={r}/>)}</div>:<p className="muted">Todavía no hay reseñas.</p>}</>}
    {view==='create'&&<form className="form" onSubmit={createReview}><h2>Nueva reseña</h2><input name="title" placeholder="Título"/><select name="category" defaultValue=""><option value="" disabled>Categoría</option>{CATEGORIES.map(c=><option key={c}>{c}</option>)}</select><textarea name="description" placeholder="Descripción breve"/><input name="price" placeholder="Precio si aplica"/><input name="address" placeholder="Dirección si aplica"/><label>Valoración<input name="rating" type="hidden" value={(document.querySelector('[data-rating-value]') as HTMLInputElement)?.value || '0'} readOnly/><RatingInput/></label><label>Fotos (1 a 10)<input name="photos" type="file" accept="image/*" multiple/></label><button className="btn ok" disabled={loading}>{loading?'Publicando...':'Publicar reseña'}</button></form>}
    {view==='admin'&&<><div className="adminBox"><h2>Administrador</h2>{admin?<><p>Sesión admin activa.</p><button className="btn warn" onClick={deleteEverything}>Borrar todo</button></>:<form onSubmit={(e)=>{e.preventDefault();const pass=String(new FormData(e.currentTarget).get('pass')||'');setAdmin(pass===ADMIN_PASSWORD); if(pass!==ADMIN_PASSWORD)setError('Clave incorrecta')}}><input name="pass" type="password" placeholder="Clave de administrador"/><br/><br/><button className="btn">Ingresar</button></form>}</div>{admin&&<div className="grid">{reviews.map(r=><ReviewCard key={r.id} r={r} adminMode/>)}</div>}</>}
  </main>
}

function RatingInput(){
  const [v,setV]=useState(0)
  return <><input data-rating-value name="rating" type="hidden" value={v} readOnly/><div><Stars value={v} onChange={setV}/></div></>
}

createRoot(document.getElementById('root')!).render(<App />)
