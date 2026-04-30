import React, { useEffect, useMemo, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { createClient } from '@supabase/supabase-js'
import './style.css'

const CATEGORIES = ['Libros', 'Peliculas', 'Series', 'Restaurant', 'Bar', 'Aplicación', 'Otras'] as const
const ADMIN_PASSWORD = 'Sebastian2885-'
const BUCKET = 'review-photos'

type Category = typeof CATEGORIES[number]
type Review = { id: number; title: string; category: Category; description: string; rating: number; price: string | null; address: string | null; author_name: string; hidden: boolean; created_at: string; photos?: Photo[]; comments?: Comment[] }
type Photo = { id: number; review_id: number; image_url: string; sort_order: number }
type Comment = { id: number; review_id: number; content: string; author_name: string; hidden: boolean; created_at: string }

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || ''
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY || ''
const supabase = supabaseUrl && supabaseKey ? createClient(supabaseUrl, supabaseKey) : null

function Stars({ value, onChange, large = false }: { value: number; onChange?: (v: number) => void; large?: boolean }) {
  return <div className={`stars ${large ? 'large' : ''}`}>{[1,2,3,4,5].map(n => <button key={n} type="button" className={n <= value ? 'star active' : 'star'} onClick={() => onChange?.(n)} disabled={!onChange}>★</button>)}</div>
}

function App() {
  const [view, setView] = useState<'home'|'reviews'|'create'|'admin'>('home')
  const [activeCategory, setActiveCategory] = useState<Category>('Libros')
  const [reviews, setReviews] = useState<Review[]>([])
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [isAdmin, setIsAdmin] = useState(false)
  const [adminPassword, setAdminPassword] = useState('')
  const [newReview, setNewReview] = useState({ title:'', category:'Libros' as Category, description:'', rating:0, price:'', address:'', author_name:'' })
  const [files, setFiles] = useState<File[]>([])
  const fileRef = useRef<HTMLInputElement | null>(null)
  const [commentDrafts, setCommentDrafts] = useState<Record<number,{author_name:string;content:string}>>({})

  const visibleReviews = useMemo(() => reviews.filter(r => !r.hidden), [reviews])
  const reviewsByCategory = useMemo(() => CATEGORIES.map(category => ({ category, items: visibleReviews.filter(r => r.category === category).sort((a,b) => b.rating - a.rating || new Date(b.created_at).getTime() - new Date(a.created_at).getTime()) })), [visibleReviews])

  async function loadData() {
    setError('')
    if (!supabase) { setError('Faltan las variables de conexión en Vercel.'); return }
    const { data: reviewRows, error: reviewError } = await supabase.from('reviews').select('*').order('created_at', { ascending:false })
    if (reviewError) { setError(reviewError.message); return }
    const { data: photoRows, error: photoError } = await supabase.from('review_photos').select('*').order('sort_order', { ascending:true })
    if (photoError) { setError(photoError.message); return }
    const { data: commentRows, error: commentError } = await supabase.from('comments').select('*').order('created_at', { ascending:true })
    if (commentError) { setError(commentError.message); return }
    const photos = (photoRows || []) as Photo[]
    const comments = (commentRows || []) as Comment[]
    setReviews(((reviewRows || []) as Review[]).map(r => ({ ...r, photos: photos.filter(p => p.review_id === r.id), comments: comments.filter(c => c.review_id === r.id) })))
  }

  useEffect(() => { loadData() }, [])

  async function createReview(e: React.FormEvent) {
    e.preventDefault(); setError('')
    if (!supabase) { setError('Faltan las variables de conexión en Vercel.'); return }
    if (!newReview.title.trim() || !newReview.description.trim() || !newReview.category || newReview.rating < 1 || !newReview.author_name.trim()) { setError('Completá nombre, título, descripción, categoría y estrellas.'); return }
    if (files.length < 1 || files.length > 10) { setError('Subí entre 1 y 10 imágenes.'); return }
    setLoading(true)
    try {
      const { data: inserted, error: insertError } = await supabase.from('reviews').insert({
        title: newReview.title.trim(), category: newReview.category, description: newReview.description.trim(), rating: newReview.rating,
        price: newReview.price.trim() || null, address: newReview.address.trim() || null, author_name: newReview.author_name.trim(), hidden: false
      }).select().single()
      if (insertError) throw insertError
      const reviewId = inserted.id as number
      for (let i=0; i<files.length; i++) {
        const f = files[i]
        const safe = f.name.normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-zA-Z0-9._-]/g,'-')
        const path = `reviews/${reviewId}/${Date.now()}-${i}-${safe}`
        const { error: uploadError } = await supabase.storage.from(BUCKET).upload(path, f, { upsert: true, contentType: f.type || 'image/jpeg' })
        if (uploadError) throw uploadError
        const { data } = supabase.storage.from(BUCKET).getPublicUrl(path)
        const { error: photoError } = await supabase.from('review_photos').insert({ review_id: reviewId, image_url: data.publicUrl, sort_order: i })
        if (photoError) throw photoError
      }
      setNewReview({ title:'', category:'Libros', description:'', rating:0, price:'', address:'', author_name:'' })
      setFiles([]); if (fileRef.current) fileRef.current.value = ''
      await loadData(); setView('reviews')
    } catch (err:any) { setError(err.message || 'No se pudo crear la reseña.') }
    finally { setLoading(false) }
  }

  async function addComment(reviewId:number) {
    if (!supabase) return
    const draft = commentDrafts[reviewId] || {author_name:'',content:''}
    if (!draft.author_name.trim() || !draft.content.trim()) { setError('Completá tu nombre y comentario.'); return }
    const { error } = await supabase.from('comments').insert({ review_id: reviewId, author_name: draft.author_name.trim(), content: draft.content.trim(), hidden:false })
    if (error) { setError(error.message); return }
    setCommentDrafts(prev => ({...prev, [reviewId]: {author_name: draft.author_name, content:''}}))
    await loadData()
  }

  async function hideReview(id:number, hidden:boolean) { if (!supabase) return; const {error}= await supabase.from('reviews').update({hidden}).eq('id',id); if(error) setError(error.message); else loadData() }
  async function deleteReview(id:number) { if (!supabase) return; const {error}= await supabase.from('reviews').delete().eq('id',id); if(error) setError(error.message); else loadData() }
  async function deleteComment(id:number) { if (!supabase) return; const {error}= await supabase.from('comments').delete().eq('id',id); if(error) setError(error.message); else loadData() }
  async function hideComment(id:number, hidden:boolean) { if (!supabase) return; const {error}= await supabase.from('comments').update({hidden}).eq('id',id); if(error) setError(error.message); else loadData() }

  return <main>
    <header className="topbar"><div><h1>Club de Reseñas</h1><p>Reseñas y recomendaciones de amigos</p></div><nav><button onClick={()=>setView('home')} className={view==='home'?'primary':''}>Inicio</button><button onClick={()=>setView('reviews')} className={view==='reviews'?'primary':''}>Reseñas</button><button onClick={()=>setView('create')} className={view==='create'?'primary':''}>Crear reseña</button><button onClick={()=>setView('admin')} className={view==='admin'?'primary':''}>Administrador</button></nav></header>
    {error && <div className="alert">{error}</div>}

    {view === 'home' && <section className="section"><h2>Top 5 mejores puntuadas por categoría</h2>{reviewsByCategory.map(group => <div key={group.category} className="categoryBlock"><h3>{group.category}</h3>{group.items.length ? <div className="grid">{group.items.slice(0,5).map(r => <ReviewCard key={r.id} review={r} commentDrafts={commentDrafts} setCommentDrafts={setCommentDrafts} addComment={addComment} canDeleteComments={isAdmin} deleteComment={deleteComment}/>)}</div> : <p className="muted">Todavía no hay reseñas en esta categoría.</p>}</div>)}</section>}

    {view === 'reviews' && <section className="section"><h2>Reseñas por categoría</h2><div className="chips">{CATEGORIES.map(c => <button key={c} className={activeCategory===c?'chip active':'chip'} onClick={()=>setActiveCategory(c)}>{c}</button>)}</div><div className="grid">{visibleReviews.filter(r => r.category === activeCategory).map(r => <ReviewCard key={r.id} review={r} commentDrafts={commentDrafts} setCommentDrafts={setCommentDrafts} addComment={addComment} canDeleteComments={isAdmin} deleteComment={deleteComment}/>)}</div>{!visibleReviews.some(r=>r.category===activeCategory) && <p className="muted">No hay reseñas en {activeCategory}.</p>}</section>}

    {view === 'create' && <section className="card"><h2>Nueva reseña</h2><form onSubmit={createReview} className="form"><input placeholder="Tu nombre" value={newReview.author_name} onChange={e=>setNewReview({...newReview, author_name:e.target.value})}/><input placeholder="Título" value={newReview.title} onChange={e=>setNewReview({...newReview, title:e.target.value})}/><select value={newReview.category} onChange={e=>setNewReview({...newReview, category:e.target.value as Category})}>{CATEGORIES.map(c => <option key={c}>{c}</option>)}</select><textarea placeholder="Descripción breve" value={newReview.description} onChange={e=>setNewReview({...newReview, description:e.target.value})}/><label>Valoración</label><Stars value={newReview.rating} onChange={(rating)=>setNewReview({...newReview, rating})} large/><input placeholder="Precio si aplica" value={newReview.price} onChange={e=>setNewReview({...newReview, price:e.target.value})}/><input placeholder="Dirección si aplica" value={newReview.address} onChange={e=>setNewReview({...newReview, address:e.target.value})}/><input ref={fileRef} type="file" accept="image/*" multiple onChange={e=>setFiles(Array.from(e.target.files || []).slice(0,10))}/><small>{files.length} imagen/es seleccionada/s. Mínimo 1, máximo 10.</small><button className="primary submit" disabled={loading}>{loading ? 'Publicando...' : 'Publicar reseña'}</button></form></section>}

    {view === 'admin' && <section className="card"><h2>Administrador</h2>{!isAdmin ? <div className="form"><input type="password" placeholder="Clave de administrador" value={adminPassword} onChange={e=>setAdminPassword(e.target.value)}/><button className="primary submit" onClick={()=> adminPassword === ADMIN_PASSWORD ? setIsAdmin(true) : setError('Clave incorrecta')}>Ingresar</button></div> : <div><p className="muted">Contenido para moderar</p>{reviews.map(r => <div className="adminItem" key={r.id}><strong>{r.title}</strong><span>{r.category} · {r.hidden ? 'Oculta' : 'Visible'}</span><div><button onClick={()=>hideReview(r.id,!r.hidden)}>{r.hidden ? 'Restaurar' : 'Ocultar'}</button><button className="danger" onClick={()=>deleteReview(r.id)}>Eliminar reseña</button></div>{(r.comments||[]).map(c => <div className="comment adminComment" key={c.id}><b>{c.author_name}</b>: {c.content} <button onClick={()=>hideComment(c.id,!c.hidden)}>{c.hidden ? 'Restaurar comentario' : 'Ocultar comentario'}</button><button className="danger" onClick={()=>deleteComment(c.id)}>Eliminar comentario</button></div>)}</div>)}</div>}</section>}
  </main>
}

function ReviewCard({ review, commentDrafts, setCommentDrafts, addComment, canDeleteComments, deleteComment }: { review:Review; commentDrafts:Record<number,{author_name:string;content:string}>; setCommentDrafts:React.Dispatch<React.SetStateAction<Record<number,{author_name:string;content:string}>>>; addComment:(id:number)=>void; canDeleteComments:boolean; deleteComment:(id:number)=>void }) {
  const draft = commentDrafts[review.id] || {author_name:'', content:''}
  const visibleComments = (review.comments || []).filter(c => !c.hidden)
  return <article className="review"><div className="photos">{(review.photos || []).slice(0,1).map(p => <img key={p.id} src={p.image_url} alt={review.title} onError={(e)=>{(e.currentTarget as HTMLImageElement).style.display='none'}}/>)}{!(review.photos||[]).length && <div className="noPhoto">Sin imagen</div>}</div><div className="reviewBody"><div className="row"><span className="pill">{review.category}</span><Stars value={review.rating}/></div><h3>{review.title}</h3><p>{review.description}</p><p className="muted">Por {review.author_name}</p>{review.price && <p className="muted">{review.price}</p>}{review.address && <p className="muted">{review.address}</p>}<hr/><h4>Comentarios</h4>{visibleComments.length ? visibleComments.map(c => <div className="comment" key={c.id}><b>{c.author_name}</b><span>{c.content}</span>{canDeleteComments && <button className="danger small" onClick={()=>deleteComment(c.id)}>Eliminar</button>}</div>) : <p className="muted">Todavía no hay comentarios.</p>}<div className="commentForm"><input placeholder="Tu nombre" value={draft.author_name} onChange={e=>setCommentDrafts(prev=>({...prev,[review.id]:{...draft,author_name:e.target.value}}))}/><input placeholder="Escribí un comentario" value={draft.content} onChange={e=>setCommentDrafts(prev=>({...prev,[review.id]:{...draft,content:e.target.value}}))}/><button onClick={()=>addComment(review.id)}>Enviar</button></div></div></article>
}

createRoot(document.getElementById('root')!).render(<App />)
