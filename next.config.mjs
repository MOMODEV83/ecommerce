/** @type {import('next').NextConfig} */
const nextConfig = {
  // Keep WordPress-style URLs (/catalogue/, /produit/..., ...).
  trailingSlash: true,
  async redirects() {
    // WordPress serves the first page of a listing without /page/1/.
    return [
      { source: "/:path*/page/1/", destination: "/:path*/", permanent: true },
      { source: "/commande/", destination: "/paiement/", permanent: false },
    ];
  },
};

export default nextConfig;
