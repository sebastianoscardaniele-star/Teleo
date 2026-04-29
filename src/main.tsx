import React, { useEffect, useMemo, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { createClient } from '@supabase/supabase-js'
import './style.css'

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
  photos?: string[]
  comments?: CommentItem[]
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
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY
const supabase = supabaseUrl && supabaseAnonKey ? createClient(supabaseUrl, supabaseAnonKey) : null

function getPublicPhotoUrl(pathOrUrl: string) {
  if (!pathOrUrl) return ''
  if (pathOrUrl.startsWith('http://') || pathOrUrl.startsWith('https://') || pathOrUrl.startsWith('blob:')) return pathOrUrl
  if (!supabase) return pathOrUrl
  const cleanPath = pathOrUrl.replace(/^\/+/, '')
  return supabase.storage.from('review-photos').getPublicUrl(cleanPath).data.publicUrl
}

function getPhotoCandidates(photo: string, reviewId: number) {
  const clean = (photo || '').replace(/^\/+/, '')
  const encodedName = clean.split('/').map(encodeURIComponent).join('/')
  const fileName = clean.split('/').pop() || clean
  const encodedFileName = encodeURIComponent(fileName)
  const candidates = [
    photo,
    getPublicPhotoUrl(clean),
    getPublicPhotoUrl(encodedName),
    getPublicPhotoUrl(fileName),
    getPublicPhotoUrl(encodedFileName),
    getPublicPhotoUrl(`reviews/${reviewId}/${fileName}`),
    getPublicPhotoUrl(`reviews/${reviewId}/${encodedFileName}`),
  ]
  return Array.from(new Set(candidates.filter(Boolean)))
}

function App() {
  const [section, setSection] = useState<'home' | 'reviews' | 'create' | 'admin'>('home')
  const [reviews, setReviews] = useState<Review[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState('')
  const [isAdmin, setIsAdmin] = useState(localStorage.getItem('club_admin') === 'true')

  const visibleReviews = reviews.filter((review) => !review.hidden)

  const bestByCategory = useMemo(() => {
    return categories.map((category) => {
      const items = visibleReviews.filter((review) => review.category === category)
      return items.sort((a, b) => b.rating - a.rating || new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0]
    }).filter(Boolean) as Review[]
  }, [visibleReviews])

  async function loadReviews() {
    setIsLoading(true)
    setError('')

    if (!supabase) {
      setReviews([])
      setIsLoading(false)
      setError('Faltan variables de Supabase en Vercel: VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY.')
      return
    }

    const { data: reviewData, error: reviewError } = await supabase
      .from('reviews')
      .select('*')
      .order('created_at', { ascending: false })

    if (reviewError) {
      setError(reviewError.message)
      setIsLoading(false)
      return
    }

    const { data: photosData } = await supabase.from('review_photos').select('*')
    const { data: commentsData } = await supabase.from('comments').select('*').order('created_at', { ascending: true })

    const hydrated = (reviewData || []).map((review: Review) => ({
      ...review,
      hidden: Boolean(review.hidden),
      photos: (photosData || [])
        .filter((photo: any) => photo.review_id === review.id)
        .sort((a: any, b: any) => (a.sort_order || 0) - (b.sort_order || 0))
        .map((photo: any) => photo.image_url),
      comments: (commentsData || [])
        .filter((comment: CommentItem) => comment.review_id === review.id)
        .map((comment: CommentItem) => ({ ...comment, hidden: Boolean(comment.hidden) }))
    }))

    setReviews(hydrated)
    setIsLoading(false)
  }

  useEffect(() => {
    loadReviews()
  }, [])

  async function createReview(form: {
    title: string
    description: string
    category: string
    rating: number
    price: string
    address: string
    files: File[]
  }) {
    setError('')
    if (!supabase) {
      setError('Supabase no está conectado. Revisá las variables de entorno en Vercel.')
      return
    }
    if (form.files.length < 1 || form.files.length > 10) {
      setError('Tenés que subir entre 1 y 10 fotos.')
      return
    }

    const { data: review, error: reviewError } = await supabase
      .from('reviews')
      .insert({
        title: form.title,
        description: form.description,
        category: form.category,
        rating: form.rating,
        price: form.price || null,
        address: form.address || null,
        hidden: false
      })
      .select()
      .single()

    if (reviewError) {
      setError(reviewError.message)
      return
    }

    for (let index = 0; index < form.files.length; index++) {
      const file = form.files[index]
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '-')
      const filePath = `reviews/${review.id}/${Date.now()}-${index}-${safeName}`

      const { error: uploadError } = await supabase.storage
        .from('review-photos')
        .upload(filePath, file, { upsert: true })

      if (uploadError) {
        setError(uploadError.message)
        return
      }

      const { data: publicData } = supabase.storage.from('review-photos').getPublicUrl(filePath)

      const { error: photoError } = await supabase.from('review_photos').insert({
        review_id: review.id,
        image_url: publicData.publicUrl,
        sort_order: index
      })

      if (photoError) {
        setError(photoError.message)
        return
      }
    }

    await loadReviews()
    setSection('reviews')
  }

  async function addComment(reviewId: number, content: string) {
    if (!supabase || !content.trim()) return
    const { error: commentError } = await supabase.from('comments').insert({ review_id: reviewId, content, hidden: false })
    if (commentError) {
      setError(commentError.message)
      return
    }
    await loadReviews()
  }

  async function updateReviewHidden(reviewId: number, hidden: boolean) {
    if (!supabase) return
    const { error: updateError } = await supabase.from('reviews').update({ hidden }).eq('id', reviewId)
    if (updateError) {
      setError(updateError.message)
      return
    }
    await loadReviews()
  }

  async function deleteReview(reviewId: number) {
    if (!supabase) return
    const { error: deleteError } = await supabase.from('reviews').delete().eq('id', reviewId)
    if (deleteError) {
      setError(deleteError.message)
      return
    }
    await loadReviews()
  }

  async function updateCommentHidden(commentId: number, hidden: boolean) {
    if (!supabase) return
    const { error: updateError } = await supabase.from('comments').update({ hidden }).eq('id', commentId)
    if (updateError) {
      setError(updateError.message)
      return
    }
    await loadReviews()
  }

  async function deleteComment(commentId: number) {
    if (!supabase) return
    const { error: deleteError } = await supabase.from('comments').delete().eq('id', commentId)
    if (deleteError) {
      setError(deleteError.message)
      return
    }
    await loadReviews()
  }

  function loginAdmin(password: string) {
    if (password === adminPassword) {
      localStorage.setItem('club_admin', 'true')
      setIsAdmin(true)
    } else {
      setError('Clave de administrador incorrecta.')
    }
  }

  return (
    <main className="app">
      <header className="hero">
        <p className="eyebrow">Club privado de amigos</p>
        <h1>Club de Reseñas</h1>
        <p>Compartí películas, libros, series, apps y restaurantes con fotos, estrellas y comentarios.</p>
      </header>

      <nav className="nav">
        <button className={section === 'home' ? 'active' : ''} onClick={() => setSection('home')}>Inicio</button>
        <button className={section === 'reviews' ? 'active' : ''} onClick={() => setSection('reviews')}>Reseñas</button>
        <button className={section === 'create' ? 'active' : ''} onClick={() => setSection('create')}>Crear reseña</button>
        <button className={section === 'admin' ? 'active' : ''} onClick={() => setSection('admin')}>Administrador</button>
      </nav>

      {error && <div className="error">{error}</div>}
      {isLoading && <div className="info">Cargando reseñas...</div>}

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
          onLogout={() => { localStorage.removeItem('club_admin'); setIsAdmin(false) }}
        />
      )}
    </main>
  )
}

function SmartImage({ photo, reviewId, alt, className }: { photo: string; reviewId: number; alt: string; className?: string }) {
  const candidates = getPhotoCandidates(photo, reviewId)
  const [candidateIndex, setCandidateIndex] = useState(0)
  const [failed, setFailed] = useState(false)

  if (!candidates.length || failed) {
    return <div className={className ? `${className} placeholder` : 'placeholder'}>Imagen no disponible</div>
  }

  return (
    <img
      className={className}
      src={candidates[candidateIndex]}
      alt={alt}
      onError={() => {
        if (candidateIndex < candidates.length - 1) {
          setCandidateIndex(candidateIndex + 1)
        } else {
          setFailed(true)
        }
      }}
    />
  )
}

function Stars({ value, onChange }: { value: number; onChange?: (value: number) => void }) {
  return (
    <div className="stars">
      {[1, 2, 3, 4, 5].map((star) => (
        <button key={star} type="button" onClick={() => onChange?.(star)} className={star <= value ? 'star selected' : 'star'}>
          ★
        </button>
      ))}
    </div>
  )
}

function Home({ bestByCategory }: { bestByCategory: Review[] }) {
  return (
    <section>
      <h2>Más valorada de cada categoría</h2>
      {bestByCategory.length === 0 ? <p className="empty">Todavía no hay reseñas visibles.</p> : <ReviewGrid reviews={bestByCategory} />}
    </section>
  )
}

function Reviews({ reviews, onAddComment }: { reviews: Review[]; onAddComment: (reviewId: number, content: string) => void }) {
  return (
    <section>
      <h2>Todas las reseñas</h2>
      {reviews.length === 0 ? <p className="empty">No hay reseñas publicadas.</p> : <ReviewGrid reviews={reviews} onAddComment={onAddComment} />}
    </section>
  )
}

function ReviewGrid({ reviews, onAddComment }: { reviews: Review[]; onAddComment?: (reviewId: number, content: string) => void }) {
  return (
    <div className="grid">
      {reviews.map((review) => (
        <ReviewCard key={review.id} review={review} onAddComment={onAddComment} />
      ))}
    </div>
  )
}

function ReviewCard({ review, onAddComment }: { review: Review; onAddComment?: (reviewId: number, content: string) => void }) {
  const [comment, setComment] = useState('')
  const visibleComments = (review.comments || []).filter((item) => !item.hidden)

  return (
    <article className="card">
      {review.photos && review.photos.length > 0 ? (
        <SmartImage className="cover" photo={review.photos[0]} reviewId={review.id} alt={review.title} />
      ) : (
        <div className="cover placeholder">Sin imagen</div>
      )}
      <div className="cardBody">
        <span className="pill">{review.category}</span>
        <h3>{review.title}</h3>
        <Stars value={review.rating} />
        <p>{review.description}</p>
        {review.price && <p><strong>Precio:</strong> {review.price}</p>}
        {review.address && <p><strong>Dirección:</strong> {review.address}</p>}
        {review.photos && review.photos.length > 1 && (
          <div className="thumbs">
            {review.photos.slice(1).map((photo) => <SmartImage key={photo} photo={photo} reviewId={review.id} alt="Foto de reseña" />)}
          </div>
        )}
        <div className="comments">
          <strong>Comentarios</strong>
          {visibleComments.map((item) => <p key={item.id} className="comment">{item.content}</p>)}
          {onAddComment && (
            <form onSubmit={(event) => { event.preventDefault(); onAddComment(review.id, comment); setComment('') }}>
              <input value={comment} onChange={(event) => setComment(event.target.value)} placeholder="Escribí un comentario" />
              <button type="submit">Comentar</button>
            </form>
          )}
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
}) {
  const [password, setPassword] = useState('')

  if (!props.isAdmin) {
    return (
      <section className="panel">
        <h2>Administrador</h2>
        <form className="form" onSubmit={(event) => { event.preventDefault(); props.onLogin(password) }}>
          <label>Clave<input type="password" value={password} onChange={(event) => setPassword(event.target.value)} /></label>
          <button className="primary" type="submit">Ingresar</button>
        </form>
      </section>
    )
  }

  return (
    <section className="panel">
      <div className="adminHeader"><h2>Moderación</h2><button onClick={props.onLogout}>Salir</button></div>
      {props.reviews.map((review) => (
        <div className={review.hidden ? 'adminItem muted' : 'adminItem'} key={review.id}>
          <h3>{review.title}</h3>
          <p>{review.category} · {review.hidden ? 'Oculta' : 'Visible'}</p>
          <div className="actions">
            <button onClick={() => props.onHideReview(review.id, !review.hidden)}>{review.hidden ? 'Restaurar reseña' : 'Ocultar reseña'}</button>
            <button className="danger" onClick={() => props.onDeleteReview(review.id)}>Eliminar reseña</button>
          </div>
          {(review.comments || []).map((comment) => (
            <div className={comment.hidden ? 'comment adminComment muted' : 'comment adminComment'} key={comment.id}>
              <span>{comment.content}</span>
              <button onClick={() => props.onHideComment(comment.id, !comment.hidden)}>{comment.hidden ? 'Restaurar' : 'Ocultar'}</button>
              <button className="danger" onClick={() => props.onDeleteComment(comment.id)}>Eliminar</button>
            </div>
          ))}
        </div>
      ))}
    </section>
  )
}

createRoot(document.getElementById('root')!).render(<App />)
