import { Route, Routes } from 'react-router-dom'
import SmoothScroll from './components/SmoothScroll'
import ScrollVideo from './components/ScrollVideo'
import AutoTour from './components/AutoTour'
import Experience from './experience/Experience'
import PromptArchive from './pages/PromptArchive'

function Home() {
  return (
    <>
      <ScrollVideo src="/media/dive.mp4" />
      <Experience />
      <AutoTour />
    </>
  )
}

export default function App() {
  return (
    <SmoothScroll>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/prompt" element={<PromptArchive />} />
      </Routes>
    </SmoothScroll>
  )
}
