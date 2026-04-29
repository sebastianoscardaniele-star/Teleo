import React, { useEffect, useMemo, useState } from 'react'
import ReactDOM from 'react-dom/client'
import { createClient } from '@supabase/supabase-js'
import './style.css'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || ''
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || ''
const supabase = supabaseUrl && supabaseAnonKey ? createClient(supabaseUrl, supabaseAnonKey) : null

const categories = ['Películas', 'Libros', 'Series', 'Aplicaciones', 'Restaurantes']
const ADMIN_PASSWORD = 'Sebastian2885-'

type View = 'inicio' | 'resenas' | 'crear' | 'admin'

type Review = {
  id: number
  title: string
  description: string
  category: string
  rating: number
  price?: string
  address?: string
  photoNames: string[]
  comments: string[]
  hidden?: boolean
}

const initialReviews: Review[] = [
  {
    id: 1,
    title: 'The Bear',
    description: 'Serie intensa, rápida y con personajes muy buenos.',
    category: 'Series',
    rating: 5,
    price: '',
    address: '',
    photoNames: ['demo-serie.jpg'],
    comments: ['La tengo pendiente.', 'Muy buena recomendación.']
  },
  {
    id: 2,
    title: 'Café de la esquina',
    description: 'Buen café, medialunas excelentes y ambiente tranquilo.',
    category: 'Restaurantes',
    rating: 4,
    price: '$$',
    address: 'Buenos Aires',
    photoNames: ['demo-cafe.jpg'],
    comments: []
  },
  {
    id: 3,
    title: 'Hábitos atómicos',
    description: 'Libro claro para ordenar rutinas y mejorar de a poco.',
    category: 'Libros',
    rating: 5,
    price: '',
    address: '',
    photoNames: ['demo-libro.jpg'],
    comments: []
  }
]

function App() {
  const [view, setView] = useState<View>('inicio')
  const [selectedCategory, setSelectedCategory] = useState('Todas')
  const [reviews, setReviews] = useState<Review[]>(initialReviews)
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [category, setCategory] = useState(categories[0])
  const [rating, setRating] = useState(5)
  const [price, setPrice] = useState('')
  const [address, setAddress] = useState('')
  const [photoNames, setPhotoNames] = useState<string[]>([])
  const [status, setStatus] = useState('')
  const [comments, setComments] = useState<Record<number, string>>({})
  const [adminPassword, setAdminPassword] = useState('')
  const [isAdmin, setIsAdmin] = useState(false)
  const [adminMessage, setAdminMessage] = useState('')

  useEffect(() => {
    async function loadReviews() {
      if (!supabase) return
      const { data, error } = await supabase
        .from('reviews')
        .select('id,title,description,category,rating,price,address,hidden')
        .order('id', { ascending: false })

      if (!error && data && data.length > 0) {
        setReviews(
          data.map((item) => ({
            id: item.id,
            title: item.title,
            description: item.description,
            category: item.category,
            rating: item.rating,
            price: item.price || '',
            address: item.address || '',
            photoNames: ['Foto subida'],
            comments: [],
            hidden: Boolean(item.hidden)
          }))
        )
      }
    }

    loadReviews()
  }, [])

  const visibleReviews = useMemo(() => reviews.filter((review) => !review.hidden), [reviews])

  const topReviewsByCategory = useMemo(() => {
    return categories.map((item) => {
      const topReview = visibleReviews
        .filter((review) => review.category === item)
        .sort((a, b) => b.rating - a.rating || b.id - a.id)[0]
      return { category: item, review: topReview }
    })
  }, [visibleReviews])

  const filteredReviews = useMemo(() => {
    if (selectedCategory === 'Todas') return visibleReviews
    return visibleReviews.filter((review) => review.category === selectedCategory)
  }, [visibleReviews, selectedCategory])

  function goTo(nextView: View) {
    setView(nextView)
    if (nextView === 'resenas') setSelectedCategory('Todas')
  }

  function handlePhotos(event: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files || [])
    if (files.length < 1) {
      setStatus('Tenés que elegir al menos 1 foto.')
      return
    }
    if (files.length > 10) {
      setStatus('Máximo 10 fotos por reseña.')
      return
    }
    setPhotoNames(files.map((file) => file.name))
    setStatus(`${files.length} foto(s) seleccionada(s).`)
  }

  async function createReview(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (!title.trim() || !description.trim()) {
      setStatus('Completá título y descripción.')
      return
    }

    if (photoNames.length < 1) {
      setStatus('Agregá al menos 1 foto para crear la reseña.')
      return
    }

    const newReview: Review = {
      id: Date.now(),
      title: title.trim(),
      description: description.trim(),
      category,
      rating,
      price: price.trim(),
      address: address.trim(),
      photoNames,
      comments: []
    }

    if (supabase) {
      const { data, error } = await supabase
        .from('reviews')
        .insert({
          title: newReview.title,
          description: newReview.description,
          rating: newReview.rating,
          price: newReview.price || null,
          address: newReview.address || null,
          category: newReview.category,
          hidden: false
        })
        .select('id')
        .single()

      if (error) {
        setStatus(`Supabase respondió: ${error.message}. Igual te muestro la reseña localmente.`)
      } else {
        newReview.id = data.id
        setStatus('Reseña guardada en Supabase.')
      }
    } else {
      setStatus('Reseña creada en modo demo. Falta conectar Supabase en Vercel.')
    }

    setReviews([newReview, ...reviews])
    setTitle('')
    setDescription('')
    setPrice('')
    setAddress('')
    setPhotoNames([])
    setView('resenas')
  }

  function addComment(reviewId: number) {
    const content = comments[reviewId]?.trim()
    if (!content) return

    setReviews((currentReviews) =>
      currentReviews.map((review) =>
        review.id === reviewId ? { ...review, comments: [...review.comments, content] } : review
      )
    )
    setComments({ ...comments, [reviewId]: '' })
  }

  function loginAdmin(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (adminPassword === ADMIN_PASSWORD) {
      setIsAdmin(true)
      setAdminPassword('')
      setAdminMessage('Administrador activo.')
    } else {
      setAdminMessage('Clave incorrecta.')
    }
  }

  async function hideReview(reviewId: number) {
    setReviews((currentReviews) => currentReviews.map((review) => review.id === reviewId ? { ...review, hidden: true } : review))

    if (supabase) {
      const { error } = await supabase.from('reviews').update({ hidden: true }).eq('id', reviewId)
      setAdminMessage(error ? `No se pudo ocultar en Supabase: ${error.message}` : 'Reseña ocultada.')
    } else {
      setAdminMessage('Reseña ocultada en modo demo.')
    }
  }

  async function restoreReview(reviewId: number) {
    setReviews((currentReviews) => currentReviews.map((review) => review.id === reviewId ? { ...review, hidden: false } : review))

    if (supabase) {
      const { error } = await supabase.from('reviews').update({ hidden: false }).eq('id', reviewId)
      setAdminMessage(error ? `No se pudo restaurar en Supabase: ${error.message}` : 'Reseña restaurada.')
    } else {
      setAdminMessage('Reseña restaurada en modo demo.')
    }
  }

  async function deleteReview(reviewId: number) {
    setReviews((currentReviews) => currentReviews.filter((review) => review.id !== reviewId))

    if (supabase) {
      const { error } = await supabase.from('reviews').delete().eq('id', reviewId)
      setAdminMessage(error ? `No se pudo eliminar en Supabase: ${error.message}` : 'Reseña eliminada.')
    } else {
      setAdminMessage('Reseña eliminada en modo demo.')
    }
  }

  function deleteComment(reviewId: number, commentIndex: number) {
    setReviews((currentReviews) =>
      currentReviews.map((review) => {
        if (review.id !== reviewId) return review
        return { ...review, comments: review.comments.filter((_, index) => index !== commentIndex) }
      })
    )
    setAdminMessage('Comentario eliminado.')
  }

  function ReviewCard({ review }: { review: Review }) {
    return (
      <article className="card">
        <div className="photoBox">{review.photoNames[0] || 'Foto'}</div>
        <div className="cardBody">
          <div className="cardTop">
            <span className="tag">{review.category}</span>
            <span>{'★'.repeat(review.rating)}{'☆'.repeat(5 - review.rating)}</span>
          </div>
          <h3>{review.title}</h3>
          <p>{review.description}</p>
          {(review.price || review.address) && <p className="small">{review.price} {review.address}</p>}
          <div className="comments">
            <strong>Comentarios</strong>
            {review.comments.length === 0 && <p className="small">Todavía no hay comentarios.</p>}
            {review.comments.map((comment, index) => <p key={index}>“{comment}”</p>)}
            <div className="commentForm">
              <input
                value={comments[review.id] || ''}
                onChange={(event) => setComments({ ...comments, [review.id]: event.target.value })}
                placeholder="Escribí un comentario"
              />
              <button type="button" onClick={() => addComment(review.id)}>Enviar</button>
            </div>
          </div>
        </div>
      </article>
    )
  }

  return (
    <main className="page">
      <section className="hero">
        <div>
          <p className="eyebrow">Club privado</p>
          <h1>Reseñas entre amigos</h1>
          <p>Películas, libros, series, apps y restaurantes recomendados por tu grupo.</p>
        </div>
        <div className="heroActions">
          <button className={view === 'inicio' ? 'primaryButton' : 'secondaryButton'} type="button" onClick={() => goTo('inicio')}>Inicio</button>
          <button className={view === 'resenas' ? 'primaryButton' : 'secondaryButton'} type="button" onClick={() => goTo('resenas')}>Reseñas</button>
          <button className={view === 'crear' ? 'primaryButton' : 'secondaryButton'} type="button" onClick={() => goTo('crear')}>Crear reseña</button>
          <button className={view === 'admin' ? 'primaryButton' : 'secondaryButton'} type="button" onClick={() => goTo('admin')}>Administrador</button>
        </div>
      </section>

      {view === 'inicio' && (
        <>
          <section className="panel">
            <div className="sectionTitle">
              <div>
                <p className="eyebrow dark">Home</p>
                <h2>Más valorada de cada categoría</h2>
              </div>
              <button className="outlineButton" type="button" onClick={() => goTo('resenas')}>Ver todas las reseñas</button>
            </div>
            <div className="topGrid">
              {topReviewsByCategory.map(({ category: item, review }) => (
                <article className="topCard" key={item}>
                  <span className="tag">{item}</span>
                  {review ? (
                    <>
                      <h3>{review.title}</h3>
                      <p>{review.description}</p>
                      <strong>{'★'.repeat(review.rating)}{'☆'.repeat(5 - review.rating)}</strong>
                    </>
                  ) : (
                    <>
                      <h3>Sin reseñas todavía</h3>
                      <p>Creá la primera recomendación para esta categoría.</p>
                      <button className="miniButton" type="button" onClick={() => { setCategory(item); goTo('crear') }}>Crear</button>
                    </>
                  )}
                </article>
              ))}
            </div>
          </section>
        </>
      )}

      {view === 'resenas' && (
        <>
          <section className="panel">
            <div className="sectionTitle">
              <div>
                <p className="eyebrow dark">Listado</p>
                <h2>Reseñas</h2>
              </div>
              <button className="outlineButton" type="button" onClick={() => goTo('crear')}>Nueva reseña</button>
            </div>
            <div className="chips">
              {['Todas', ...categories].map((item) => (
                <button
                  key={item}
                  type="button"
                  onClick={() => setSelectedCategory(item)}
                  className={selectedCategory === item ? 'chip active' : 'chip'}
                >
                  {item}
                </button>
              ))}
            </div>
          </section>
          <section className="reviews">
            {filteredReviews.map((review) => <ReviewCard key={review.id} review={review} />)}
          </section>
        </>
      )}

      {view === 'crear' && (
        <section className="panel">
          <div className="sectionTitle">
            <div>
              <p className="eyebrow dark">Publicar</p>
              <h2>Nueva reseña</h2>
            </div>
            <button className="outlineButton" type="button" onClick={() => goTo('resenas')}>Volver a reseñas</button>
          </div>
          <form className="form" onSubmit={createReview}>
            <label>
              Título
              <input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Ej: Oppenheimer" />
            </label>

            <label>
              Categoría
              <select value={category} onChange={(event) => setCategory(event.target.value)}>
                {categories.map((item) => (
                  <option key={item}>{item}</option>
                ))}
              </select>
            </label>

            <label>
              Descripción breve
              <textarea value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Contá por qué lo recomendás" />
            </label>

            <label>
              Valoración: {rating} estrella(s)
              const [rating, setRating] = useState(0)

<div style={{ display: "flex", gap: "5px" }}>
  {[1, 2, 3, 4, 5].map((star) => (
    <span
      key={star}
      onClick={() => setRating(star)}
      style={{
        cursor: "pointer",
        fontSize: "30px",
        color: star <= rating ? "gold" : "gray"
      }}
    >
      ★
    </span>
  ))}
</div>>
            </label>

            <div className="gridTwo">
              <label>
                Precio, si aplica
                <input value={price} onChange={(event) => setPrice(event.target.value)} placeholder="Ej: $$ o $15.000" />
              </label>

              <label>
                Dirección, si aplica
                <input value={address} onChange={(event) => setAddress(event.target.value)} placeholder="Ej: Palermo, CABA" />
              </label>
            </div>

            <label>
              Fotos, mínimo 1 y máximo 10
              <input type="file" accept="image/*" multiple onChange={handlePhotos} />
            </label>

            {photoNames.length > 0 && <p className="small">Fotos: {photoNames.join(', ')}</p>}

            <button className="primaryButton darkText" type="submit">Publicar reseña</button>
          </form>
          {status && <p className="status">{status}</p>}
        </section>
      )}

      {view === 'admin' && (
        <section className="panel adminPanel">
          <div className="adminHeader">
            <div>
              <p className="eyebrow dark">Moderación</p>
              <h2>Panel de administrador</h2>
              <p className="small">Entrá con la clave para ocultar, restaurar o eliminar reseñas y comentarios.</p>
            </div>
            {isAdmin && <button className="dangerGhost" type="button" onClick={() => setIsAdmin(false)}>Cerrar admin</button>}
          </div>

          {!isAdmin ? (
            <form className="adminLogin" onSubmit={loginAdmin}>
              <label>
                Clave de administrador
                <input
                  type="password"
                  value={adminPassword}
                  onChange={(event) => setAdminPassword(event.target.value)}
                  placeholder="Ingresá la clave"
                />
              </label>
              <button className="primaryButton darkText" type="submit">Ingresar</button>
            </form>
          ) : (
            <div className="adminList">
              {reviews.map((review) => (
                <article className={review.hidden ? 'adminItem mutedItem' : 'adminItem'} key={review.id}>
                  <div>
                    <strong>{review.title}</strong>
                    <p className="small">{review.category} · {review.hidden ? 'Oculta' : 'Visible'}</p>
                    <p>{review.description}</p>
                    {review.comments.length > 0 && (
                      <div className="adminComments">
                        <strong>Comentarios</strong>
                        {review.comments.map((comment, index) => (
                          <div className="adminCommentRow" key={`${review.id}-${index}`}>
                            <span>{comment}</span>
                            <button type="button" onClick={() => deleteComment(review.id, index)}>Borrar comentario</button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="adminActions">
                    {review.hidden ? (
                      <button type="button" onClick={() => restoreReview(review.id)}>Restaurar</button>
                    ) : (
                      <button type="button" onClick={() => hideReview(review.id)}>Ocultar</button>
                    )}
                    <button className="dangerButton" type="button" onClick={() => deleteReview(review.id)}>Eliminar</button>
                  </div>
                </article>
              ))}
            </div>
          )}
          {adminMessage && <p className="status">{adminMessage}</p>}
        </section>
      )}
    </main>
  )
}

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(<App />)
