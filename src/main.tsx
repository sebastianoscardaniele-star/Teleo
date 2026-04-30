import React, { FormEvent, useEffect, useMemo, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { createClient } from '@supabase/supabase-js'
import './styles.css'

type Category = 'Libros' | 'Peliculas' | 'Series' | 'Restaurant' | 'Bar' | 'Aplicación' | 'Otras'
type View = 'inicio' | 'resenas' | 'crear' | 'admin'

type Review = {
  id: number
  title: string
  category: Category
  description: string
  rating: number
  price?: string | null
  address?: string | null
  image_url?: string | null
  is_hidden?: boolean | null
  created_at?: string
}

type Comment = { id: number; review_id: number; author_name: string; content: string; is_hidden?: boolean | null; created_at?: string }

const categories: Category[] = ['Libros', 'Peliculas', 'Series', 'Restaurant', 'Bar', 'Aplicación', 'Otras']
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || ''
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY || ''
const supabase = supabaseUrl && supabaseKey ? createClient(supabaseUrl, supabaseKey) : null
const ADMIN_PASSWORD = 'Sebastian2885-'

function Stars({ value, onChange }: { value: number; onChange?: (n: number) => void }) {
  return <span className="stars">{[1,2,3,4,5].map(n => <span key={n} onClick={() => onChange?.(n)}>{n <= value ? '★' : '☆'}</span>)}</span>
}

function App() {
  const [view, setView] = useState<View>('inicio')
  const [reviews, setReviews] = useState<Review[]>([])
  const [comments, setComments] = useState<Comment[]>([])
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [admin, setAdmin] = useState(false)
  const [adminPass, setAdminPass] = useState('')
  const [selectedCategory, setSelectedCategory] = useState<Category>('Libros')

  const [title, setTitle] = useState('')
  const [category, setCategory] = useState<Category>('Libros')
  const [description, setDescription] = useState('')
  const [rating, setRating] = useState(0)
  const [price, setPrice] = useState('')
  const [address, setAddress] = useState('')
  const [files, setFiles] = useState<FileList | null>(null)

  async function loadData() {
    setError('')
    if (!supabase) { setError('Faltan las variables VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY en Vercel.'); return }
    const { data: r, error: re } = await supabase.from('reviews').select('*').order('created_at', { ascending: false })
    const { data: c, error: ce } = await supabase.from('comments').select('*').order('created_at', { ascending: true })
    if (re) setError(re.message)
    if (ce) setError(ce.message)
    setReviews((r || []) as Review[])
    setComments((c || []) as Comment[])
  }

  useEffect(() => { loadData() }, [])

  const visibleReviews = useMemo(() => reviews.filter(r => !r.is_hidden), [reviews])
  const topByCategory = useMemo(() => {
    const result: Record<Category, Review[]> = {} as Record<Category, Review[]>
    categories.forEach(cat => { result[cat] = visibleReviews.filter(r => r.category === cat).sort((a,b) => b.rating - a.rating).slice(0,5) })
    return result
  }, [visibleReviews])

  async function uploadImage(file: File) {
    if (!supabase) throw new Error('Supabase no está conectado')
    const safeName = file.name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9.\-_]/g, '-')
    const path = `reviews/${Date.now()}-${Math.random().toString(36).slice(2)}-${safeName}`
    const { error: uploadError } = await supabase.storage.from('review-photos').upload(path, file, { upsert: false, contentType: file.type })
    if (uploadError) throw uploadError
    const { data } = supabase.storage.from('review-photos').getPublicUrl(path)
    return data.publicUrl
  }

  async function createReview(e: FormEvent) {
    e.preventDefault(); setError(''); setSuccess('')
    if (!title.trim() || !description.trim() || !category || rating < 1) { setError('Completá título, descripción, categoría y estrellas.'); return }
    if (!files || files.length < 1) { setError('Subí al menos 1 imagen.'); return }
    if (files.length > 10) { setError('Máximo 10 imágenes.'); return }
    try {
      const imageUrl = await uploadImage(files[0])
      const { error: insertError } = await supabase!.from('reviews').insert({ title, category, description, rating, price: price || null, address: address || null, image_url: imageUrl, is_hidden: false })
      if (insertError) throw insertError
      setTitle(''); setCategory('Libros'); setDescription(''); setRating(0); setPrice(''); setAddress(''); setFiles(null)
      const input = document.getElementById('photos') as HTMLInputElement | null; if (input) input.value = ''
      setSuccess('Reseña publicada correctamente.'); setView('resenas'); await loadData()
    } catch (err: any) { setError(err.message || 'No se pudo publicar la reseña.') }
  }

  async function addComment(reviewId: number) {
    const name = prompt('Tu nombre')?.trim(); if (!name) return
    const text = prompt('Comentario')?.trim(); if (!text) return
    const { error } = await supabase!.from('comments').insert({ review_id: reviewId, author_name: name, content: text, is_hidden: false })
    if (error) setError(error.message); else loadData()
  }

  async function hideReview(id: number, hidden: boolean) { const { error } = await supabase!.from('reviews').update({ is_hidden: hidden }).eq('id', id); if (error) setError(error.message); else loadData() }
  async function deleteReview(id: number) { if (!confirm('¿Eliminar reseña definitivamente?')) return; const { error } = await supabase!.from('reviews').delete().eq('id', id); if (error) setError(error.message); else loadData() }
  async function deleteComment(id: number) { if (!confirm('¿Eliminar comentario?')) return; const { error } = await supabase!.from('comments').delete().eq('id', id); if (error) setError(error.message); else loadData() }

  return <div className="app">
    <header className="top">
      <div className="brand"><h1>Club de Reseñas FINAL</h1><p>Reseñas por categoría, top 5 y moderación</p></div>
      <nav className="nav">
        <button className={view==='inicio'?'active':''} onClick={()=>setView('inicio')}>Inicio</button>
        <button className={view==='resenas'?'active':''} onClick={()=>setView('resenas')}>Reseñas</button>
        <button className={view==='crear'?'active':''} onClick={()=>setView('crear')}>Crear reseña</button>
        <button className={view==='admin'?'active':''} onClick={()=>setView('admin')}>Administrador</button>
      </nav>
    </header>
    {error && <div className="error">{error}</div>}{success && <div className="success">{success}</div>}
    {view==='inicio' && <><section className="hero"><h2>Top 5 mejores puntuadas por categoría</h2><p>Las reseñas favoritas del grupo, ordenadas por estrellas.</p></section>{categories.map(cat => <section className="cat-block" key={cat}><div className="cat-head"><h2 className="section-title">{cat}</h2><button className="btn small" onClick={()=>{setSelectedCategory(cat);setView('resenas')}}>Ver categoría</button></div>{topByCategory[cat].length ? <div className="grid">{topByCategory[cat].map(r => <ReviewCard key={r.id} review={r} comments={comments.filter(c=>c.review_id===r.id && !c.is_hidden)} onComment={addComment}/>)}</div> : <div className="empty">Todavía no hay reseñas en esta categoría.</div>}</section>)}</>}
    {view==='resenas' && <><section className="hero"><h2>Reseñas por categoría</h2><p>Seleccioná una categoría para ver sus reseñas.</p></section><div className="row">{categories.map(cat => <button key={cat} className={`btn small ${selectedCategory===cat?'primary':''}`} onClick={()=>setSelectedCategory(cat)}>{cat}</button>)}</div><h2 className="section-title">{selectedCategory}</h2><div className="grid">{visibleReviews.filter(r=>r.category===selectedCategory).map(r => <ReviewCard key={r.id} review={r} comments={comments.filter(c=>c.review_id===r.id && !c.is_hidden)} onComment={addComment}/>)}</div>{!visibleReviews.filter(r=>r.category===selectedCategory).length && <div className="empty">No hay reseñas en esta categoría.</div>}</>}
    {view==='crear' && <section className="panel"><h2>Nueva reseña</h2><form onSubmit={createReview}><input className="field" value={title} onChange={e=>setTitle(e.target.value)} placeholder="Título"/><select className="field" value={category} onChange={e=>setCategory(e.target.value as Category)}>{categories.map(c=><option key={c}>{c}</option>)}</select><textarea className="field textarea" value={description} onChange={e=>setDescription(e.target.value)} placeholder="Breve descripción"/><div><strong>Valoración: </strong><Stars value={rating} onChange={setRating}/></div><input className="field" value={price} onChange={e=>setPrice(e.target.value)} placeholder="Precio si aplica"/><input className="field" value={address} onChange={e=>setAddress(e.target.value)} placeholder="Dirección si aplica"/><input id="photos" className="field" type="file" accept="image/*" multiple onChange={e=>setFiles(e.target.files)}/><button className="btn primary" type="submit">Publicar reseña</button></form></section>}
    {view==='admin' && <section className="panel"><h2>Administrador</h2>{!admin ? <div className="row"><input className="field" style={{maxWidth:360}} type="password" value={adminPass} onChange={e=>setAdminPass(e.target.value)} placeholder="Clave de administrador"/><button className="btn primary" onClick={()=> adminPass===ADMIN_PASSWORD ? setAdmin(true) : setError('Clave incorrecta')}>Ingresar</button></div> : <><h3>Reseñas</h3>{reviews.map(r => <div className="comment" key={r.id}><strong>{r.title}</strong> <span className="muted">({r.category}) {r.is_hidden?'Oculta':'Visible'}</span><div className="admin-actions"><button className="btn small" onClick={()=>hideReview(r.id,!r.is_hidden)}>{r.is_hidden?'Restaurar':'Ocultar'}</button><button className="btn small danger" onClick={()=>deleteReview(r.id)}>Eliminar</button></div></div>)}<h3>Comentarios</h3>{comments.map(c => <div className="comment" key={c.id}><strong>{c.author_name}:</strong> {c.content}<div><button className="btn small danger" onClick={()=>deleteComment(c.id)}>Eliminar comentario</button></div></div>)}</>}</section>}
  </div>
}

function ReviewCard({ review, comments, onComment }: { review: Review; comments: Comment[]; onComment: (id:number)=>void }) {
  return <article className="card"><div className="thumb">{review.image_url ? <img src={review.image_url} alt={review.title}/> : <span>Sin imagen</span>}</div><div className="body"><div className="row" style={{justifyContent:'space-between'}}><span className="pill">{review.category}</span><Stars value={review.rating}/></div><h2>{review.title}</h2><p>{review.description}</p>{review.price && <p className="muted">{review.price}</p>}{review.address && <p className="muted">{review.address}</p>}<h3>Comentarios</h3>{comments.length ? comments.map(c => <div className="comment" key={c.id}><strong>{c.author_name}</strong><p>{c.content}</p></div>) : <p className="muted">Todavía no hay comentarios.</p>}<button className="btn small" onClick={()=>onComment(review.id)}>Comentar</button></div></article>
}

createRoot(document.getElementById('root')!).render(<App />)
