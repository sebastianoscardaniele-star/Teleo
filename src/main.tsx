import React, { useMemo, useState } from 'react'
import ReactDOM from 'react-dom/client'
import { createClient } from '@supabase/supabase-js'
import './style.css'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || ''
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || ''
const supabase = supabaseUrl && supabaseAnonKey ? createClient(supabaseUrl, supabaseAnonKey) : null

const categories = ['Películas', 'Libros', 'Series', 'Aplicaciones', 'Restaurantes']

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
  }
]

function App() {
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

  const filteredReviews = useMemo(() => {
    if (selectedCategory === 'Todas') return reviews
    return reviews.filter((review) => review.category === selectedCategory)
  }, [reviews, selectedCategory])

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
      const { error } = await supabase.from('reviews').insert({
        title: newReview.title,
        description: newReview.description,
        rating: newReview.rating,
        price: newReview.price || null,
        address: newReview.address || null,
        category: newReview.category
      })

      if (error) {
        setStatus(`Supabase respondió: ${error.message}. Igual te muestro la reseña localmente.`)
      } else {
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

  return (
    <main className="page">
      <section className="hero">
        <div>
          <p className="eyebrow">Club privado</p>
          <h1>Reseñas entre amigos</h1>
          <p>Películas, libros, series, apps y restaurantes recomendados por tu grupo.</p>
        </div>
        <a className="primaryButton" href="#crear">Crear reseña</a>
      </section>

      <section className="panel">
        <h2>Categorías</h2>
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

      <section id="crear" className="panel">
        <h2>Nueva reseña</h2>
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
            <input type="range" min="1" max="5" value={rating} onChange={(event) => setRating(Number(event.target.value))} />
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

          <button className="primaryButton" type="submit">Publicar reseña</button>
        </form>
        {status && <p className="status">{status}</p>}
      </section>

      <section className="reviews">
        {filteredReviews.map((review) => (
          <article className="card" key={review.id}>
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
        ))}
      </section>
    </main>
  )
}

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(<App />)
