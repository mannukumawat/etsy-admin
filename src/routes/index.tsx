import { lazy } from 'react';
import { createBrowserRouter, Navigate } from 'react-router-dom';
import { AdminLayout, AuthLayout, RequireAdmin } from '@/layouts/AdminLayout';
import { RouteError } from '@/pages/NotFoundPage';

const LoginPage = lazy(() => import('@/pages/LoginPage'));
const ForgotPasswordPage = lazy(() => import('@/pages/ForgotPasswordPage'));
const DashboardPage = lazy(() => import('@/pages/DashboardPage'));
const ProductsPage = lazy(() => import('@/pages/products/ProductsPage'));
const ProductEditorPage = lazy(() => import('@/pages/products/ProductEditorPage'));
const CategoriesPage = lazy(() => import('@/pages/CategoriesPage'));
const InventoryPage = lazy(() => import('@/pages/InventoryPage'));
const OrdersPage = lazy(() => import('@/pages/orders/OrdersPage'));
const OrderDetailPage = lazy(() => import('@/pages/orders/OrderDetailPage'));
const CustomersPage = lazy(() => import('@/pages/customers/CustomersPage'));
const CustomerDetailPage = lazy(() => import('@/pages/customers/CustomerDetailPage'));
const CouponsPage = lazy(() => import('@/pages/CouponsPage'));
const ReviewsPage = lazy(() => import('@/pages/ReviewsPage'));
const ReturnsPage = lazy(() => import('@/pages/returns/ReturnsPage'));
const ReturnDetailPage = lazy(() => import('@/pages/returns/ReturnDetailPage'));
const TranslationsPage = lazy(() => import('@/pages/TranslationsPage'));
const HomepageContentPage = lazy(() => import('@/pages/content/HomepageContentPage'));
const PagesListPage = lazy(() => import('@/pages/content/PagesListPage'));
const PageEditorPage = lazy(() => import('@/pages/content/PageEditorPage'));
const MediaPage = lazy(() => import('@/pages/MediaPage'));
const NavLinksPage = lazy(() => import('@/pages/NavLinksPage'));
const CollectionsListPage = lazy(() => import('@/pages/collections/CollectionsListPage'));
const CollectionEditorPage = lazy(() => import('@/pages/collections/CollectionEditorPage'));
const StoreSettingsPage = lazy(() => import('@/pages/settings/StoreSettingsPage'));
const ShippingSettingsPage = lazy(() => import('@/pages/settings/ShippingSettingsPage'));
const TaxSettingsPage = lazy(() => import('@/pages/settings/TaxSettingsPage'));
const CurrencySettingsPage = lazy(() => import('@/pages/settings/CurrencySettingsPage'));
const NotFoundPage = lazy(() => import('@/pages/NotFoundPage'));

export const router = createBrowserRouter([
  {
    element: <AuthLayout />,
    errorElement: <RouteError />,
    children: [
      { path: '/login', element: <LoginPage /> },
      { path: '/forgot-password', element: <ForgotPasswordPage /> },
    ],
  },
  {
    element: (
      <RequireAdmin>
        <AdminLayout />
      </RequireAdmin>
    ),
    errorElement: <RouteError />,
    children: [
      { path: '/', element: <Navigate to="/dashboard" replace /> },
      { path: '/dashboard', element: <DashboardPage /> },
      { path: '/products', element: <ProductsPage /> },
      { path: '/products/new', element: <ProductEditorPage /> },
      { path: '/products/:id/edit', element: <ProductEditorPage /> },
      { path: '/categories', element: <CategoriesPage /> },
      { path: '/inventory', element: <InventoryPage /> },
      { path: '/orders', element: <OrdersPage /> },
      { path: '/orders/:id', element: <OrderDetailPage /> },
      { path: '/customers', element: <CustomersPage /> },
      { path: '/customers/:id', element: <CustomerDetailPage /> },
      { path: '/coupons', element: <CouponsPage /> },
      { path: '/reviews', element: <ReviewsPage /> },
      { path: '/returns', element: <ReturnsPage /> },
      { path: '/returns/:id', element: <ReturnDetailPage /> },
      { path: '/content/homepage', element: <HomepageContentPage /> },
      { path: '/content/pages', element: <PagesListPage /> },
      { path: '/content/pages/:key', element: <PageEditorPage /> },
      { path: '/media', element: <MediaPage /> },
      { path: '/navigation', element: <NavLinksPage /> },
      { path: '/collections', element: <CollectionsListPage /> },
      { path: '/translations', element: <TranslationsPage /> },
      { path: '/collections/new', element: <CollectionEditorPage /> },
      { path: '/collections/:id/edit', element: <CollectionEditorPage /> },
      { path: '/settings', element: <Navigate to="/settings/store" replace /> },
      { path: '/settings/store', element: <StoreSettingsPage /> },
      { path: '/settings/shipping', element: <ShippingSettingsPage /> },
      { path: '/settings/tax', element: <TaxSettingsPage /> },
      { path: '/settings/currencies', element: <CurrencySettingsPage /> },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
]);
