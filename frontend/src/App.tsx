import AdminSecurity from './admin/AdminSecurity';
import GuestOrderPage from './pages/GuestOrderPage';
import AdminOperations from './admin/AdminOperations';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { CartProvider } from './context/CartContext';
import Layout from './components/Layout';
import ScrollToTop from './components/ScrollToTop';
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
import StoreHelp from './pages/StoreHelp';
import AuthorPage from './pages/AuthorPage';
import PublisherPage from './pages/PublisherPage';
import StoresPage from './pages/StoresPage';
import ExamsPage from './pages/ExamsPage';
import TrackPage from './pages/TrackPage';
import OrderPlacedPage from './pages/OrderPlacedPage';
import ForgotPasswordPage from './pages/ForgotPasswordPage';
import ResetPasswordPage from './pages/ResetPasswordPage';
import VerifyEmailPage from './pages/VerifyEmailPage';
import DialogHost from './components/Dialogs';
import AdminCampaigns from './admin/AdminCampaigns';
import AdminSubscribers from './admin/AdminSubscribers';
import UnsubscribePage from './pages/UnsubscribePage';
import FormGuard from './components/FormGuard';
import NotFoundPage from './pages/NotFoundPage';
import ErrorBoundary from './components/ErrorBoundary';
import AdminLayout from './admin/AdminLayout';
import AdminDashboard from './admin/AdminDashboard';
import AdminProducts from './admin/AdminProducts';
import AdminProductForm from './admin/AdminProductForm';
import AdminCategories from './admin/AdminCategories';
import AdminLogin from './admin/AdminLogin';
import AdminStaff from './admin/AdminStaff';
import AdminOrders from './admin/AdminOrders';
import AdminMarketing from './admin/AdminMarketing';
import AdminHelp from './admin/AdminHelp';
import AdminEmails from './admin/AdminEmails';
import AdminCustomers from './admin/AdminCustomers';
import AdminShipping from './admin/AdminShipping';
import AdminReviews from './admin/AdminReviews';

export default function App() {
  return (
    <ErrorBoundary>
    <BrowserRouter>
      <ScrollToTop />
      <AuthProvider>
        <CartProvider>
          <DialogHost />
          <FormGuard />
          <Routes>
            <Route path="/admin/login" element={<AdminLogin />} />
            <Route path="/admin" element={<AdminLayout />}>
              <Route index element={<AdminDashboard />} />
              <Route path="products" element={<AdminProducts />} />
              <Route path="products/new" element={<AdminProductForm />} />
              <Route path="products/:id" element={<AdminProductForm />} />
              <Route path="categories" element={<AdminCategories />} />
              {['inventory','payments','returns','reports','gifts','settings','audit','catalogue-tools'].map(section=><Route key={section} path={section} element={<AdminOperations section={section==='catalogue-tools'?'products':section} />} />)}
              <Route path="security" element={<AdminSecurity />} />
              <Route path="staff" element={<AdminStaff />} />
              <Route path="orders" element={<AdminOrders />} />
              <Route path="customers" element={<AdminOperations section="customers" />} />
              <Route path="reviews" element={<AdminReviews />} />
              <Route path="shipping" element={<AdminShipping />} />
              <Route path="marketing" element={<AdminMarketing />} />
              <Route path="campaigns" element={<AdminCampaigns />} />
              <Route path="subscribers" element={<AdminSubscribers />} />
              <Route path="help" element={<AdminHelp />} />
              <Route path="emails" element={<AdminOperations section="emails" />} />
            </Route>
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
              <Route path="help" element={<StoreHelp page="help" />} />
              <Route path="faq" element={<StoreHelp page="help" />} />
              <Route path="shipping" element={<StoreHelp page="shipping" />} />
              <Route path="returns" element={<StoreHelp page="returns" />} />
              <Route path="about" element={<StoreHelp page="about" />} />
              <Route path="contact" element={<StoreHelp page="contact" />} />
              <Route path="terms" element={<StoreHelp page="terms" />} />
              <Route path="privacy" element={<StoreHelp page="privacy" />} />
              <Route path="authors/:id" element={<AuthorPage />} />
              <Route path="publishers" element={<PublisherPage />} />
              <Route path="publishers/:slug" element={<PublisherPage />} />
              <Route path="stores" element={<StoresPage />} />
              <Route path="exams" element={<ExamsPage />} />
              <Route path="guest-order" element={<GuestOrderPage />} />
              <Route path="track" element={<TrackPage />} />
              <Route path="order-placed" element={<OrderPlacedPage />} />
              <Route path="forgot-password" element={<ForgotPasswordPage />} />
              <Route path="reset-password" element={<ResetPasswordPage />} />
              <Route path="verify-email" element={<VerifyEmailPage />} />
              <Route path="unsubscribe" element={<UnsubscribePage />} />
              <Route path="*" element={<NotFoundPage />} />
            </Route>
          </Routes>
        </CartProvider>
      </AuthProvider>
    </BrowserRouter>
    </ErrorBoundary>
  );
}
