import React, { useEffect, useMemo, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { createClient } from '@supabase/supabase-js'
import './style.css'

type Section = 'home' | 'reviews' | 'create' | 'admin'

type Review = {
  id: number
  title: string
  description: string
  rating: number
  category: string
  price: string | null
  address: string | null
  hidden: boolean
  created_at: string
  photos: string[]
  comments: CommentItem[]
}

type CommentItem = {
  id: number
  review_id: number
  content: string
  hidden: boolean
  created_at: string
}

const categories = ['Películas', 'Libros', 'Series', 'Aplicaciones', 'Restaurantes']
const adminPassword = 'Sebastian2885-'
const bucketName = 'review-photos'
const version = 'versión real storage + sin demo v2'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || ''
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || ''
const supabase = supabaseUrl && supabaseAnonKey ? createClient(supabaseUrl, supabaseAnonKey) : null

function publicUrlToStoragePath(url: string | null | undefined) {
  if (!url) return ''
  const marker = `/storage/v1/object/public/${bucketName}/`
  const index = url.indexOf(marker)
  if (index === -1) return ''
  return decodeURIComponent(url.slice(index + marker.length))
}

function App() {
  const [section, setSection] = useState<Section>('home')
  const [reviews, setReviews] = useState<Review[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [message, setMessage] = useState('')
  const [isAdmin, setIsAdmin] = useState(localStorage.getItem('club_admin') === 'true')

  const visibleReviews = reviews.filter((review) => !review.hidden)

  const bestByCategory = useMemo(() => {
    return categories
      .map((category) => visibleReviews
        .filter((review) => review.category === category)
        .sort((a, b) => b.rating - a.rating || new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0])
      .filter(Boolean) as Review[]
  }, [visibleReviews])

  async function loadReviews() {
    setIsLoading(true)
    setMessage('')

    if (!supabase) {
      setReviews([])
      setMessage('Faltan variables de Supabase en Vercel: VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY. Esta versión no usa datos demo.')
      setIsLoading(false)
      return
    }

    const { data: reviewRows, error: reviewError } = await supabase
      .from('reviews')
      .select('*')
      .order('created_at', { ascending: false })

    if (reviewError) {
      setMessage(`Error cargando reseñas: ${reviewError.message}`)
      setReviews([])
      setIsLoading(false)
      return
    }

    const { data: photoRows, error: photoError } = await supabase
      .from('review_photos')
      .select('*')
      .order('sort_order', { ascending: true })

    const { data: commentRows, error: commentError } = await supabase
      .from('comments')
      .select('*')
      .order('created_at', { ascending: true })

    if (photoError || commentError) {
      setMessage(photoError?.message || commentError?.message || 'Error cargando datos.')
    }

    const hydrated = (reviewRows || []).map((review: any) => ({
      id: review.id,
      title: review.title,
      description: review.description,
      rating: Number(review.rating || 1),
      category: review.category,
      price: review.price,
      address: review.address,
      hidden: Boolean(review.hidden),
      created_at: review.created_at,
      photos: (photoRows || [])
        .filter((photo: any) => photo.review_id === review.id)
        .sort((a: any, b: any) => Number(a.sort_order || 0) - Number(b.sort_order || 0))
        .map((photo: any) => String(photo.image_url || ''))
        .filter((url: string) => url.startsWith('http://') || url.startsWith('https://')),
      comments: (commentRows || [])
        .filter((comment: any) => comment.review_id === review.id)
        .map((comment: any) => ({
          id: comment.id,
          review_id: comment.review_id,
          content: comment.content,
          hidden: Boolean(comment.hidden),
          created_at: comment.created_at,
        }))
    }))

    setReviews(hydrated)
    setIsLoading(false)
  }

  useEffect(() => { loadReviews() }, [])

  async function createReview(form: {
    title: string
    description: string
    category: string
    rating: number
    price: string
    address: string
    files: File[]
  }) {
    setMessage('')
    if (!supabase) {
      setMessage('Supabase no está conectado. Revisá VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY en Vercel.')
      return
    }

    const cleanFiles = form.files.filter((file) => file && file.size > 0)
    if (cleanFiles.length < 1 || cleanFiles.length > 10) {
      setMessage('Tenés que subir entre 1 y 10 fotos antes de publicar.')
      return
    }

    if (!form.title.trim() || !form.description.trim()) {
      setMessage('Completá título y descripción.')
      return
    }

    setIsLoading(true)
    const uploadedPhotos: { publicUrl: string; path: string }[] = []

    for (let index = 0; index < cleanFiles.length; index++) {
      const file = cleanFiles[index]
      const safeName = file.name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9.\-_]/g, '-')
      const extension = safeName.includes('.') ? safeName.split('.').pop() : 'jpg'
      const filePath = `reviews/${Date.now()}-${crypto.randomUUID()}-${index}.${extension}`

      const { error: uploadError } = await supabase.storage
        .from(bucketName)
        .upload(filePath, file, {
          contentType: file.type || 'image/jpeg',
          cacheControl: '3600',
          upsert: false,
        })

      if (uploadError) {
        setIsLoading(false)
        setMessage(`No se pudo subir la imagen a Supabase Storage: ${uploadError.message}. Revisá que exista el bucket público "review-photos" y sus policies.`)
        return
      }

      const { data } = supabase.storage.from(bucketName).getPublicUrl(filePath)
      if (!data.publicUrl) {
        setIsLoading(false)
        setMessage('La imagen subió, pero Supabase no devolvió una URL pública.')
        return
      }

      uploadedPhotos.push({ publicUrl: data.publicUrl, path: filePath })
    }

    const { data: review, error: reviewError } = await supabase
      .from('reviews')
      .insert({
        title: form.title.trim(),
        description: form.description.trim(),
        category: form.category,
        rating: form.rating,
        price: form.price.trim() || null,
        address: form.address.trim() || null,
        hidden: false,
      })
      .select('id')
      .single()

    if (reviewError || !review) {
      await supabase.storage.from(bucketName).remove(uploadedPhotos.map((photo) => photo.path))
      setIsLoading(false)
      setMessage(`Las fotos subieron, pero no se pudo crear la reseña: ${reviewError?.message || 'sin respuesta de Supabase'}`)
      return
    }

    const photoRows = uploadedPhotos.map((photo, index) => ({
      review_id: review.id,
      image_url: photo.publicUrl,
      storage_path: photo.path,
      sort_order: index,
    }))

    const { error: photoError } = await supabase.from('review_photos').insert(photoRows)

    if (photoError) {
      setIsLoading(false)
      setMessage(`La reseña se creó y las fotos subieron, pero no se guardaron las URLs: ${photoError.message}`)
      await loadReviews()
      return
    }

    setIsLoading(false)
    await loadReviews()
    setSection('reviews')
    setMessage('Reseña publicada correctamente con imagen en Supabase Storage.')
  }

  async function addComment(reviewId: number, content: string) {
    if (!supabase || !content.trim()) return
    const { error } = await supabase.from('comments').insert({ review_id: reviewId, content: content.trim(), hidden: false })
    if (error) setMessage(`No se pudo comentar: ${error.message}`)
    await loadReviews()
  }

  async function updateReviewHidden(reviewId: number, hidden: boolean) {
    if (!supabase) return
    const { error } = await supabase.from('reviews').update({ hidden }).eq('id', reviewId)
    if (error) setMessage(`No se pudo actualizar la reseña: ${error.message}`)
    await loadReviews()
  }

  async function deleteReview(reviewId: number) {
    if (!supabase) return
    const { data: photos } = await supabase.from('review_photos').select('storage_path, image_url').eq('review_id', reviewId)
    const paths = (photos || [])
      .map((photo: any) => photo.storage_path || publicUrlToStoragePath(photo.image_url))
      .filter(Boolean) as string[]
    if (paths.length) await supabase.storage.from(bucketName).remove(paths)
    const { error } = await supabase.from('reviews').delete().eq('id', reviewId)
    if (error) setMessage(`No se pudo eliminar la reseña: ${error.message}`)
    else setMessage('Reseña eliminada definitivamente.')
    await loadReviews()
  }

  async function deleteAllReviews() {
    if (!supabase) return
    const ok = window.confirm('¿Seguro que querés borrar TODAS las reseñas y fotos? Esta acción no se puede deshacer.')
    if (!ok) return
    const { data: photos } = await supabase.from('review_photos').select('storage_path, image_url')
    const paths = (photos || [])
      .map((photo: any) => photo.storage_path || publicUrlToStoragePath(photo.image_url))
      .filter(Boolean) as string[]
    if (paths.length) await supabase.storage.from(bucketName).remove(paths)
    await supabase.from('comments').delete().neq('id', -1)
    await supabase.from('review_photos').delete().neq('id', -1)
    const { error } = await supabase.from('reviews').delete().neq('id', -1)
    if (error) setMessage(`No se pudo borrar todo: ${error.message}`)
    else setMessage('Se borraron todas las reseñas guardadas.')
    await loadReviews()
  }

  async function updateCommentHidden(commentId: number, hidden: boolean) {
    if (!supabase) return
    const { error } = await supabase.from('comments').update({ hidden }).eq('id', commentId)
    if (error) setMessage(`No se pudo actualizar el comentario: ${error.message}`)
    await loadReviews()
  }

  async function deleteComment(commentId: number) {
    if (!supabase) return
    const { error } = await supabase.from('comments').delete().eq('id', commentId)
    if (error) setMessage(`No se pudo eliminar el comentario: ${error.message}`)
    await loadReviews()
  }

  function loginAdmin(password: string) {
    if (password === adminPassword) {
      localStorage.setItem('club_admin', 'true')
      setIsAdmin(true)
      setMessage('Administrador activo.')
    } else {
      setMessage('Clave de administrador incorrecta.')
    }
  }

  return (
    <main className="app">
      <header className="hero">
        <p className="eyebrow">Club privado de amigos · {version}</p>
        <h1>Club de Reseñas</h1>
        <p>Películas, libros, series, aplicaciones y restaurantes con fotos, estrellas y comentarios.</p>
      </header>

      <nav className="nav">
        <button className={section === 'home' ? 'active' : ''} onClick={() => setSection('home')}>Inicio</button>
        <button className={section === 'reviews' ? 'active' : ''} onClick={() => setSection('reviews')}>Reseñas</button>
        <button className={section === 'create' ? 'active' : ''} onClick={() => setSection('create')}>Crear reseña</button>
        <button className={section === 'admin' ? 'active' : ''} onClick={() => setSection('admin')}>Administrador</button>
      </nav>

      {message && <div className="message">{message}</div>}
      {isLoading && <div className="message">Cargando...</div>}

      {section === 'home' && <Home bestByCategory={bestByCategory} />}
      {section === 'reviews' && <Reviews reviews={visibleReviews} onAddComment={addComment} />}
      {section === 'create' && <CreateReview onCreate={createReview} />}
      {section === 'admin' && (
        <AdminPanel
          reviews={reviews}
          isAdmin={isAdmin}
          onLogin={loginAdmin}
          onHideReview={updateReviewHidden}
          onDeleteReview={deleteReview}
          onHideComment={updateCommentHidden}
          onDeleteComment={deleteComment}
          onDeleteAllReviews={deleteAllReviews}
          onLogout={() => { localStorage.removeItem('club_admin'); setIsAdmin(false); setMessage('Administrador desactivado.') }}
        />
      )}
    </main>
  )
}

function Stars({ value, onChange }: { value: number; onChange?: (value: number) => void }) {
  return (
    <div className="stars" aria-label={`${value} estrellas`}>
      {[1, 2, 3, 4, 5].map((star) => (
        <button key={star} type="button" onClick={() => onChange?.(star)} className={star <= value ? 'star selected' : 'star'} disabled={!onChange}>★</button>
      ))}
    </div>
  )
}

function Home({ bestByCategory }: { bestByCategory: Review[] }) {
  return <section><h2>Más valorada de cada categoría</h2>{bestByCategory.length ? <ReviewGrid reviews={bestByCategory} /> : <p className="empty">Todavía no hay reseñas visibles.</p>}</section>
}

function Reviews({ reviews, onAddComment }: { reviews: Review[]; onAddComment: (reviewId: number, content: string) => void }) {
  return <section><h2>Todas las reseñas</h2>{reviews.length ? <ReviewGrid reviews={reviews} onAddComment={onAddComment} /> : <p className="empty">No hay reseñas publicadas.</p>}</section>
}

function ReviewGrid({ reviews, onAddComment }: { reviews: Review[]; onAddComment?: (reviewId: number, content: string) => void }) {
  return <div className="grid">{reviews.map((review) => <ReviewCard key={review.id} review={review} onAddComment={onAddComment} />)}</div>
}

function ReviewCard({ review, onAddComment }: { review: Review; onAddComment?: (reviewId: number, content: string) => void }) {
  const [comment, setComment] = useState('')
  const visibleComments = review.comments.filter((item) => !item.hidden)

  return (
    <article className="card">
      {review.photos[0] ? <img className="cover" src={review.photos[0]} alt={review.title} /> : <div className="cover emptyCover">Sin imagen</div>}
      <div className="cardBody">
        <div className="topLine"><span className="pill">{review.category}</span><Stars value={review.rating} /></div>
        <h3>{review.title}</h3>
        <p>{review.description}</p>
        {review.price && <p className="muted"><strong>Precio:</strong> {review.price}</p>}
        {review.address && <p className="muted"><strong>Dirección:</strong> {review.address}</p>}
        {review.photos.length > 1 && <div className="thumbs">{review.photos.slice(1).map((photo) => <img key={photo} src={photo} alt="Foto de reseña" />)}</div>}
        <div className="comments">
          <strong>Comentarios</strong>
          {visibleComments.length ? visibleComments.map((item) => <p key={item.id} className="comment">{item.content}</p>) : <p className="muted">Todavía no hay comentarios.</p>}
          {onAddComment && <form onSubmit={(event) => { event.preventDefault(); onAddComment(review.id, comment); setComment('') }}><input value={comment} onChange={(event) => setComment(event.target.value)} placeholder="Escribí un comentario" /><button type="submit">Enviar</button></form>}
        </div>
      </div>
    </article>
  )
}

function CreateReview({ onCreate }: { onCreate: (form: any) => void }) {
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [category, setCategory] = useState(categories[0])
  const [rating, setRating] = useState(5)
  const [price, setPrice] = useState('')
  const [address, setAddress] = useState('')
  const [files, setFiles] = useState<File[]>([])

  return (
    <section className="panel">
      <h2>Crear reseña</h2>
      <form className="form" onSubmit={(event) => { event.preventDefault(); onCreate({ title, description, category, rating, price, address, files }) }}>
        <label>Título<input required value={title} onChange={(event) => setTitle(event.target.value)} /></label>
        <label>Categoría<select value={category} onChange={(event) => setCategory(event.target.value)}>{categories.map((item) => <option key={item}>{item}</option>)}</select></label>
        <label>Descripción<textarea required value={description} onChange={(event) => setDescription(event.target.value)} /></label>
        <label>Valoración<Stars value={rating} onChange={setRating} /></label>
        <label>Precio si aplica<input value={price} onChange={(event) => setPrice(event.target.value)} /></label>
        <label>Dirección si aplica<input value={address} onChange={(event) => setAddress(event.target.value)} /></label>
        <label>Fotos, mínimo 1 y máximo 10<input required type="file" accept="image/*" multiple onChange={(event) => setFiles(Array.from(event.target.files || []).slice(0, 10))} /></label>
        <button className="primary" type="submit">Publicar reseña</button>
      </form>
    </section>
  )
}

function AdminPanel(props: {
  reviews: Review[]
  isAdmin: boolean
  onLogin: (password: string) => void
  onHideReview: (reviewId: number, hidden: boolean) => void
  onDeleteReview: (reviewId: number) => void
  onHideComment: (commentId: number, hidden: boolean) => void
  onDeleteComment: (commentId: number) => void
  onLogout: () => void
  onDeleteAllReviews: () => void
}) {
  const [password, setPassword] = useState('')
  if (!props.isAdmin) return <section className="panel"><h2>Administrador</h2><form className="form" onSubmit={(event) => { event.preventDefault(); props.onLogin(password) }}><label>Clave<input type="password" value={password} onChange={(event) => setPassword(event.target.value)} /></label><button className="primary" type="submit">Ingresar</button></form></section>

  return (
    <section className="panel">
      <div className="adminHeader"><h2>Moderación</h2><div className="actions"><button className="danger" onClick={props.onDeleteAllReviews}>Borrar todo</button><button onClick={props.onLogout}>Salir</button></div></div>
      {props.reviews.length === 0 && <p className="empty">No hay reseñas para moderar.</p>}
      {props.reviews.map((review) => (
        <div className={review.hidden ? 'adminItem hiddenItem' : 'adminItem'} key={review.id}>
          <h3>{review.title}</h3>
          <p>{review.category} · {review.hidden ? 'Oculta' : 'Visible'}</p>
          <div className="actions"><button onClick={() => props.onHideReview(review.id, !review.hidden)}>{review.hidden ? 'Restaurar reseña' : 'Ocultar reseña'}</button><button className="danger" onClick={() => props.onDeleteReview(review.id)}>Eliminar reseña</button></div>
          {review.comments.map((comment) => <div className={comment.hidden ? 'comment adminComment hiddenItem' : 'comment adminComment'} key={comment.id}><span>{comment.content}</span><button onClick={() => props.onHideComment(comment.id, !comment.hidden)}>{comment.hidden ? 'Restaurar' : 'Ocultar'}</button><button className="danger" onClick={() => props.onDeleteComment(comment.id)}>Eliminar</button></div>)}
        </div>
      ))}
    </section>
  )
}

createRoot(document.getElementById('root')!).render(<App />)
