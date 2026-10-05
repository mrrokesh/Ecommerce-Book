import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { CartProvider } from './context/CartContext';
import Layout from './components/Layout';
import HomePage from './pages/HomePage';
import ShopPage from './pages/ShopPage';
import BookDetailPage from './pages/BookDetailPage';
import SearchPage from './pages/SearchPage';
import CartPage from './pages/CartPage';
import CheckoutPage from './pages/CheckoutPage';
import LoginPage from './pages/LoginPage';
import RegisterPage from './pages/RegisterPage';
import AccountPage from './pages/AccountPage';
import OrdersPage from './pages/OrdersPage';
import WishlistPage from './pages/WishlistPage';
import CmsPage from './pages/CmsPage';
import AuthorPage from './pages/AuthorPage';
import PublisherPage from './pages/PublisherPage';
import StoresPage from './pages/StoresPage';
import ExamsPage from './pages/ExamsPage';
import TrackPage from './pages/TrackPage';
import ForgotPasswordPage from './pages/ForgotPasswordPage';
import ResetPasswordPage from './pages/ResetPasswordPage';
import AdminPage from './pages/AdminPage';

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <CartProvider>
          <Routes>
            <Route element={<Layout />}>
              <Route index element={<HomePage />} />
              <Route path="shop" element={<ShopPage />} />
              <Route path="shop/:categorySlug" element={<ShopPage />} />
              <Route path="books/:slug" element={<BookDetailPage />} />
              <Route path="search" element={<SearchPage />} />
              <Route path="cart" element={<CartPage />} />
              <Route path="checkout" element={<CheckoutPage />} />
              <Route path="login" element={<LoginPage />} />
              <Route path="register" element={<RegisterPage />} />
              <Route path="account" element={<AccountPage />} />
              <Route path="account/orders" element={<OrdersPage />} />
              <Route path="wishlist" element={<WishlistPage />} />
              <Route path="about" element={<CmsPage />} />
              <Route path="contact" element={<CmsPage />} />
              <Route path="terms" element={<CmsPage />} />
              <Route path="privacy" element={<CmsPage />} />
              <Route path="faq" element={<CmsPage />} />
              <Route path="authors/:id" element={<AuthorPage />} />
              <Route path="publishers" element={<PublisherPage />} />
              <Route path="publishers/:slug" element={<PublisherPage />} />
              <Route path="stores" element={<StoresPage />} />
              <Route path="exams" element={<ExamsPage />} />
              <Route path="track" element={<TrackPage />} />
              <Route path="forgot-password" element={<ForgotPasswordPage />} />
              <Route path="reset-password" element={<ResetPasswordPage />} />
              <Route path="admin" element={<AdminPage />} />
            </Route>
          </Routes>
        </CartProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}
