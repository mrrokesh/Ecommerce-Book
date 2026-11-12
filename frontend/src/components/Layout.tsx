import { Outlet } from 'react-router-dom';
import Header from './Header';
import SearchBar from './SearchBar';
import Footer from './Footer';
import ToastHost from './Toast';
import VerifyBanner from './VerifyBanner';

export default function Layout() {
  return (
    <div className="app-shell">
      <Header />
      <VerifyBanner />
      <SearchBar />
      <main className="main-content">
        <Outlet />
      </main>
      <Footer />
      <ToastHost />
    </div>
  );
}
