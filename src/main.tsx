import React from 'react'
import { createRoot } from 'react-dom/client'
import { Star, MessageCircle, Camera, PlusCircle } from 'lucide-react'
import './styles.css'

type Review = {
  id: number
  title: string
  category: string
  description: string
  rating: number
  price?: string
  address?: string
  comments: number
  image: string
}

const reviews: Review[] = [
  {
    id: 1,
    title: 'Dune: Parte Dos',
    category: 'Películas',
    description: 'Visualmente increíble, ideal para ver con pantalla grande y buen sonido.',
    rating: 5,
    comments: 4,
    image: 'https://images.unsplash.com/photo-1489599849927-2ee91cede3ba?auto=format&fit=crop&w=900&q=80'
  },
  {
    id: 2,
    title: 'Café La Esquina',
    category: 'Restaurantes',
    description: 'Buen lugar para brunch. La atención fue rápida y el café muy bueno.',
    rating: 4,
    price: '$$',
    address: 'Palermo, Buenos Aires',
    comments: 7,
    image: 'https://images.unsplash.com/photo-1554118811-1e0d58224f24?auto=format&fit=crop&w=900&q=80'
  },
  {
    id: 3,
    title: 'Notion',
    category: 'Aplicaciones',
    description: 'Muy útil para organizar proyectos, listas y notas compartidas.',
    rating: 5,
    comments: 2,
    image: 'https://images.unsplash.com/photo-1497366754035-f200968a6e72?auto=format&fit=crop&w=900&q=80'
  }
]

function Rating({ value }: { value: number }) {
  return (
    <div className="rating" aria-label={`${value} de 5 estrellas`}>
      {Array.from({ length: 5 }).map((_, index) => (
        <Star key={index} size={18} fill={index < value ? 'currentColor' : 'none'} />
      ))}
    </div>
  )
}

function App() {
  const supabaseReady = Boolean(import.meta.env.VITE_SUPABASE_URL && import.meta.env.VITE_SUPABASE_ANON_KEY)

  return (
    <main className="app-shell">
      <section className="hero">
        <div>
          <p className="eyebrow">Club privado de amigos</p>
          <h1>Reseñas para películas, libros, series, apps y restaurantes.</h1>
          <p className="hero-text">
            Publicá recomendaciones con fotos, valoración, precio, dirección y comentarios del grupo.
          </p>
        </div>
        <button className="primary-button">
          <PlusCircle size={20} /> Nueva reseña
        </button>
      </section>

      <section className="status-card">
        <strong>Estado Supabase:</strong>{' '}
        {supabaseReady
          ? 'variables configuradas en Vercel.'
          : 'pendiente. La app funciona con datos de ejemplo hasta que agregues las variables.'}
      </section>

      <section className="categories">
        {['Películas', 'Libros', 'Series', 'Aplicaciones', 'Restaurantes'].map((category) => (
          <button key={category}>{category}</button>
        ))}
      </section>

      <section className="grid">
        {reviews.map((review) => (
          <article className="card" key={review.id}>
            <img src={review.image} alt={review.title} />
            <div className="card-body">
              <span className="pill">{review.category}</span>
              <h2>{review.title}</h2>
              <Rating value={review.rating} />
              <p>{review.description}</p>
              <div className="meta">
                {review.price && <span>{review.price}</span>}
                {review.address && <span>{review.address}</span>}
              </div>
              <div className="card-footer">
                <span><Camera size={16} /> 1-10 fotos</span>
                <span><MessageCircle size={16} /> {review.comments} comentarios</span>
              </div>
            </div>
          </article>
        ))}
      </section>
    </main>
  )
}

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
