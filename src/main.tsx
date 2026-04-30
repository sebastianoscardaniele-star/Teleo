import React, { FormEvent, useEffect, useMemo, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { createClient } from '@supabase/supabase-js'
import './styles.css'

type Category = 'Libros' | 'Peliculas' | 'Series' | 'Restaurant' | 'Bar' | 'Aplicación' | 'Otras'
type View = 'inicio' | 'resenas' | 'crear' | 'admin'

type Review = {
  id: number
  title: string
  description: string
  category: Category
  rating: number
  price: string | null
  address: string | null
  author_name: string | null
  is_hidden: boolean
  created_at: string
  photos: string[]
  comments: CommentItem[]
}

type CommentItem = {
  id: number
  review_id: number
  author_name: string
  content: string
  is_hidden: boolean
  created_at: string
}

const categories: Category[] = ['Libros', 'Peliculas', 'Series', 'Restaurant', 'Bar', 'Aplicación', 'Otras']
const adminPassword = 'Sebastian2885-'
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined
const supabase = supabaseUrl && supabaseAnonKey ? createClient(supabaseUrl, supabaseAnonKey) : null

const emptyForm = {
  author_name: '',
  title: '',
  category: 'Libros' as Category,
  description: '',
  rating: 0,
  price: '',
  address: ''
}

function App() {
  const [view, setView] = useState<View>('inicio')
  const [reviews, setReviews] = useState<Review[]>([])
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState('')
  const [form, setForm] = useState(emptyForm)
  const [files, setFiles] = useState<File[]>([])
  const [commentText, setCommentText] = useState<Record<number, string>>({})
  const [commentAuthor, setCommentAuthor] = useState<Record<number, string>>({})
  const [adminInput, setAdminInput] = useState('')
  const [isAdmin, setIsAdmin] = useState(false)
  const [activeCategory, setActiveCategory] = useState<Category>('Libros')

  useEffect(() => {
    loadData()
  }, [])

  async function loadData() {
    setLoading(true)
    setMessage('')
    if (!supabase) {
      setMessage('Faltan las variables de conexión en Vercel.')
      setLoading(false)
      return
    }

    const { data: reviewRows, error: reviewError } = await supabase
      .from('reviews')
      .select('*')
      .order('created_at', { ascending: false })

    if (reviewError) {
      setMessage(reviewError.message)
      setLoading(false)
      return
    }

    const { data: photoRows } = await supabase.from('review_photos').select('*').order('sort_order')
    const { data: commentRows } = await supabase.from('comments').select('*').order('created_at', { ascending: true })

    const built = (reviewRows || []).map((r: any) => ({
      ...r,
      category: normalizeCategory(r.category),
      photos: (photoRows || []).filter((p: any) => p.review_id === r.id).map((p: any) => p.image_url),
      comments: (commentRows || []).filter((c: any) => c.review_id === r.id)
    })) as Review[]

    setReviews(built)
    setLoading(false)
  }

  function normalizeCategory(value: string): Category {
    return categories.includes(value as Category) ? value as Category : 'Otras'
  }

  const visibleReviews = useMemo(() => reviews.filter(r => !r.is_hidden), [reviews])

  const topByCategory = useMemo(() => {
    return categories.map(category => ({
      category,
      items: visibleReviews
        .filter(r => r.category === category)
        .sort((a, b) => b.rating - a.rating || new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
        .slice(0, 5)
    }))
  }, [visibleReviews])

  async function uploadImages(reviewId: number, selected: File[]) {
    if (!supabase) return []
    const urls: string[] = []

    for (let i = 0; i < selected.length; i++) {
      const file = selected[i]
      const cleanName = file.name.replace(/[^a-zA-Z0-9._-]/g, '-')
      const path = `reviews/${reviewId}/${Date.now()}-${i}-${cleanName}`

      const { error: uploadError } = await supabase.storage.from('review-photos').upload(path, file, {
        cacheControl: '3600',
        upsert: false
      })

      if (uploadError) throw new Error(`No se pudo subir la imagen: ${uploadError.message}`)

      const { data } = supabase.storage.from('review-photos').getPublicUrl(path)
      urls.push(data.publicUrl)

      const { error: photoError } = await supabase.from('review_photos').insert({
        review_id: reviewId,
        image_url: data.publicUrl,
        sort_order: i
      })

      if (photoError) throw new Error(`No se pudo guardar la imagen: ${photoError.message}`)
    }

    return urls
  }

  async function createReview(event: FormEvent) {
    event.preventDefault()
    setMessage('')
    if (!supabase) return setMessage('Faltan las variables de conexión en Vercel.')
    if (!form.title.trim() || !form.description.trim() || !form.category || form.rating < 1) {
      return setMessage('Completá título, descripción, categoría y estrellas.')
    }
    if (files.length < 1 || files.length > 10) return setMessage('Subí entre 1 y 10 fotos.')

    try {
      const { data, error } = await supabase.from('reviews').insert({
        title: form.title.trim(),
        description: form.description.trim(),
        category: form.category,
        rating: form.rating,
        price: form.price.trim() || null,
        address: form.address.trim() || null,
        author_name: form.author_name.trim() || 'Anónimo',
        is_hidden: false
      }).select().single()

      if (error) throw new Error(error.message)
      await uploadImages(data.id, files)
      setForm(emptyForm)
      setFiles([])
      const input = document.getElementById('photo-input') as HTMLInputElement | null
      if (input) input.value = ''
      await loadData()
      setView('resenas')
    } catch (err: any) {
      setMessage(err.message || 'No se pudo crear la reseña.')
    }
  }

  async function addComment(reviewId: number) {
    if (!supabase) return setMessage('Faltan las variables de conexión en Vercel.')
    const content = (commentText[reviewId] || '').trim()
    const author = (commentAuthor[reviewId] || '').trim() || 'Anónimo'
    if (!content) return setMessage('Escribí un comentario.')
    const { error } = await supabase.from('comments').insert({ review_id: reviewId, content, author_name: author, is_hidden: false })
    if (error) return setMessage(error.message)
    setCommentText(prev => ({ ...prev, [reviewId]: '' }))
    await loadData()
  }

  async function deleteComment(id: number) {
    if (!supabase) return
    await supabase.from('comments').delete().eq('id', id)
    await loadData()
  }

  async function hideReview(id: number, hidden: boolean) {
    if (!supabase) return
    await supabase.from('reviews').update({ is_hidden: hidden }).eq('id', id)
    await loadData()
  }

  async function deleteReview(id: number) {
    if (!supabase) return
    await supabase.from('reviews').delete().eq('id', id)
    await loadData()
  }

  function onFileChange(selected: FileList | null) {
    const next = Array.from(selected || []).slice(0, 10)
    setFiles(next)
  }

  function Stars({ value, onChange }: { value: number; onChange?: (n: number) => void }) {
    return <div className="stars">{[1,2,3,4,5].map(n => <button key={n} type="button" onClick={() => onChange?.(n)} className={n <= value ? 'star on' : 'star'}>★</button>)}</div>
  }

  function ReviewCard({ review, admin = false }: { review: Review; admin?: boolean }) {
    const comments = review.comments.filter(c => !c.is_hidden)
    return <article className="card">
      {review.photos[0] ? <img className="cover" src={review.photos[0]} alt={review.title} /> : <div className="cover placeholder">Sin imagen</div>}
      <div className="card-body">
        <div className="row"><span className="tag">{review.category}</span><Stars value={review.rating} /></div>
        <h3>{review.title}</h3>
        <p>{review.description}</p>
        <p className="muted">Por {review.author_name || 'Anónimo'}</p>
        {review.price && <p className="muted">Precio: {review.price}</p>}
        {review.address && <p className="muted">Dirección: {review.address}</p>}
        {review.photos.length > 1 && <div className="thumbs">{review.photos.slice(1).map((p, i) => <img key={i} src={p} alt={`${review.title} ${i + 2}`} />)}</div>}
        <hr />
        <h4>Comentarios</h4>
        {comments.length === 0 && <p className="muted">Todavía no hay comentarios.</p>}
        {comments.map(c => <div className="comment" key={c.id}><strong>{c.author_name || 'Anónimo'}:</strong> {c.content}{admin && <button className="small danger" onClick={() => deleteComment(c.id)}>Eliminar</button>}</div>)}
        {!admin && <div className="comment-form">
          <input placeholder="Tu nombre" value={commentAuthor[review.id] || ''} onChange={e => setCommentAuthor(prev => ({ ...prev, [review.id]: e.target.value }))} />
          <input placeholder="Escribí un comentario" value={commentText[review.id] || ''} onChange={e => setCommentText(prev => ({ ...prev, [review.id]: e.target.value }))} />
          <button onClick={() => addComment(review.id)}>Enviar</button>
        </div>}
        {admin && <div className="admin-actions">
          <button onClick={() => hideReview(review.id, !review.is_hidden)}>{review.is_hidden ? 'Restaurar' : 'Ocultar'}</button>
          <button className="danger" onClick={() => deleteReview(review.id)}>Eliminar reseña</button>
        </div>}
      </div>
    </article>
  }

  return <main>
    <header className="header">
      <div><h1>Club de Reseñas</h1><p>Reseñas compartidas entre amigos</p></div>
      <nav>
        <button className={view === 'inicio' ? 'active' : ''} onClick={() => setView('inicio')}>Inicio</button>
        <button className={view === 'resenas' ? 'active' : ''} onClick={() => setView('resenas')}>Reseñas</button>
        <button className={view === 'crear' ? 'active' : ''} onClick={() => setView('crear')}>Crear reseña</button>
        <button className={view === 'admin' ? 'active' : ''} onClick={() => setView('admin')}>Administrador</button>
      </nav>
    </header>

    {message && <div className="alert">{message}</div>}
    {loading && <div className="panel">Cargando...</div>}

    {!loading && view === 'inicio' && <section>
      <h2>Top 5 mejores puntuadas por categoría</h2>
      {topByCategory.map(group => <div key={group.category} className="category-block">
        <h3>{group.category}</h3>
        {group.items.length === 0 ? <p className="muted">Sin reseñas todavía.</p> : <div className="grid">{group.items.map(r => <ReviewCard key={r.id} review={r} />)}</div>}
      </div>)}
    </section>}

    {!loading && view === 'resenas' && <section>
      <h2>Reseñas por categoría</h2>
      <div className="tabs">{categories.map(c => <button key={c} className={activeCategory === c ? 'active' : ''} onClick={() => setActiveCategory(c)}>{c}</button>)}</div>
      <div className="grid">{visibleReviews.filter(r => r.category === activeCategory).map(r => <ReviewCard key={r.id} review={r} />)}</div>
      {visibleReviews.filter(r => r.category === activeCategory).length === 0 && <p className="muted">No hay reseñas en esta categoría.</p>}
    </section>}

    {!loading && view === 'crear' && <section className="panel">
      <h2>Nueva reseña</h2>
      <form onSubmit={createReview}>
        <input placeholder="Tu nombre" value={form.author_name} onChange={e => setForm({ ...form, author_name: e.target.value })} />
        <input placeholder="Título" value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} />
        <select value={form.category} onChange={e => setForm({ ...form, category: e.target.value as Category })}>{categories.map(c => <option key={c}>{c}</option>)}</select>
        <textarea placeholder="Descripción breve" value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} />
        <label>Valoración</label><Stars value={form.rating} onChange={rating => setForm({ ...form, rating })} />
        <input placeholder="Precio si aplica" value={form.price} onChange={e => setForm({ ...form, price: e.target.value })} />
        <input placeholder="Dirección si aplica" value={form.address} onChange={e => setForm({ ...form, address: e.target.value })} />
        <label>Fotos: mínimo 1, máximo 10</label>
        <input id="photo-input" type="file" accept="image/*" multiple onChange={e => onFileChange(e.target.files)} />
        <p className="muted">Fotos seleccionadas: {files.length}</p>
        <button className="primary" type="submit">Publicar reseña</button>
      </form>
    </section>}

    {!loading && view === 'admin' && <section className="panel">
      {!isAdmin ? <div>
        <h2>Administrador</h2>
        <input type="password" placeholder="Clave" value={adminInput} onChange={e => setAdminInput(e.target.value)} />
        <button className="primary" onClick={() => setIsAdmin(adminInput === adminPassword)}>Ingresar</button>
      </div> : <div>
        <h2>Moderación</h2>
        <div className="grid">{reviews.map(r => <ReviewCard key={r.id} review={r} admin />)}</div>
      </div>}
    </section>}
  </main>
}

createRoot(document.getElementById('root')!).render(<App />)
