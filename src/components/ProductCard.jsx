import { Link } from 'react-router-dom';
import { useCart } from '../context/CartContext';
import { FaShoppingCart, FaStar, FaMinus, FaPlus, FaTrash } from 'react-icons/fa';

const ProductCard = ({ product }) => {
  const { addToCart, cart, updateQuantity, removeFromCart } = useCart();
  const displayPrice = product.discountPrice || product.onlinePrice || product.price || 0;
  const hasDiscount = product.discountPrice && product.discountPrice < product.onlinePrice;
  
  // Get quantity of this product in cart
  const cartItem = cart.find(item => item.id === product.id);
  const quantityInCart = cartItem ? cartItem.quantity : 0;

  const handleIncrease = (e) => {
    e.stopPropagation();
    updateQuantity(product.id, quantityInCart + 1);
  };

  const handleDecrease = (e) => {
    e.stopPropagation();
    if (quantityInCart > 1) {
      updateQuantity(product.id, quantityInCart - 1);
    } else {
      removeFromCart(product.id);
    }
  };

  const handleRemove = (e) => {
    e.stopPropagation();
    removeFromCart(product.id);
  };

  return (
    <div
      className="bg-white overflow-hidden group cursor-pointer flex flex-col h-full transform hover:-translate-y-1 hover:scale-[1.03]"
      style={{ 
        borderRadius: '20px',
        boxShadow: '0 12px 35px rgba(0,0,0,0.10)',
        transition: 'all 0.2s ease'
      }}
      onMouseEnter={(e) => e.currentTarget.style.boxShadow = '0 20px 50px rgba(0,0,0,0.20)'}
      onMouseLeave={(e) => e.currentTarget.style.boxShadow = '0 12px 35px rgba(0,0,0,0.10)'}
    >
      <Link to={`/product/${product.id}`}>
        <div className="relative h-56 overflow-hidden flex-shrink-0">
          <div className="absolute inset-0 bg-gradient-to-br from-primary-500/20 to-accent-500/20 mix-blend-multiply z-10"></div>
          <img
            src={product.imageURL || 'https://via.placeholder.com/300x200?text=Product'}
            alt={product.name}
            className="w-full h-full object-cover group-hover:scale-110"
            style={{ transition: 'transform 0.2s ease' }}
          />
          {product.isFeatured && (
            <div className="absolute top-3 left-3 bg-gradient-to-r from-accent-500 to-accent-600 text-white px-3 py-1.5 rounded-full text-xs font-bold shadow-lg z-20 flex items-center gap-1">
              <FaStar className="text-xs" />
              Featured
            </div>
          )}
          {/* Green Quantity Badge */}
          {quantityInCart > 0 && (
            <div className="absolute top-3 right-3 bg-green-500 text-white px-3 py-1.5 rounded-full text-xs font-bold shadow-lg z-20 flex items-center justify-center border-2 border-white">
              {quantityInCart} in cart
            </div>
          )}
          <div 
            className="absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-transparent opacity-0 group-hover:opacity-100 z-10"
            style={{ transition: 'opacity 0.2s ease' }}
          ></div>
        </div>
      </Link>

      <div className="p-6 flex flex-col flex-grow">
        <Link to={`/product/${product.id}`}>
          <h3 className="font-bold text-gray-900 mb-2 line-clamp-2 hover:text-primary-600 text-lg min-h-[3.5rem] flex items-start" style={{ fontFamily: 'Poppins, sans-serif', transition: 'color 0.2s ease' }}>
            {product.name}
          </h3>
        </Link>
        <p className="text-sm text-gray-500 mb-3 font-medium h-5" style={{ fontFamily: 'Inter, sans-serif' }}>{product.category}</p>
        <div className="flex items-center justify-between mb-4 h-8">
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-bold" style={{ color: '#FF6000', fontFamily: 'Poppins, sans-serif' }}>
              Rs. {displayPrice}
            </span>
            {hasDiscount && (
              <span className="text-sm line-through" style={{ color: '#9CA3AF' }}>Rs. {product.onlinePrice}</span>
            )}
          </div>
        </div>
        {quantityInCart === 0 ? (
          // Before Adding - Gradient "Add to Cart" Button
          <button
            onClick={() => addToCart(product)}
            disabled={product.outOfStock}
            className="w-full text-white py-3 font-semibold flex items-center justify-center gap-2 disabled:cursor-not-allowed mt-auto"
            style={{
              background: product.outOfStock ? 'linear-gradient(90deg, #9CA3AF, #6B7280)' : 'linear-gradient(90deg, #FF6A4C, #FFB464)',
              borderRadius: '12px',
              fontFamily: 'Inter, sans-serif',
              boxShadow: '0 3px 10px rgba(0,0,0,0.15)',
              transition: 'all 0.2s ease'
            }}
          >
            <FaShoppingCart />
            {product.outOfStock ? 'Out of Stock' : 'Add to Cart'}
          </button>
        ) : (
          // After Adding - Quantity Controls
          <div className="w-full flex items-center gap-2 mt-auto">
            <button
              onClick={handleDecrease}
              className="flex-1 py-3 flex items-center justify-center hover:scale-105"
              style={{
                background: '#FFFFFF',
                border: '1px solid rgba(0,0,0,0.1)',
                borderRadius: '12px',
                boxShadow: '0 3px 10px rgba(0,0,0,0.08)',
                color: '#FF6A4C',
                transition: 'all 0.2s ease'
              }}
            >
              <FaMinus />
            </button>
            <div
              className="flex-1 py-3 flex items-center justify-center font-bold"
              style={{
                background: '#FFFFFF',
                border: '1px solid rgba(0,0,0,0.1)',
                borderRadius: '12px',
                boxShadow: '0 3px 10px rgba(0,0,0,0.08)',
                fontFamily: 'Poppins, sans-serif',
                fontSize: '1.1rem',
                color: '#333'
              }}
            >
              {quantityInCart}
            </div>
            <button
              onClick={handleIncrease}
              className="flex-1 py-3 flex items-center justify-center hover:scale-105"
              style={{
                background: '#FFFFFF',
                border: '1px solid rgba(0,0,0,0.1)',
                borderRadius: '12px',
                boxShadow: '0 3px 10px rgba(0,0,0,0.08)',
                color: '#F8C330',
                transition: 'all 0.2s ease'
              }}
            >
              <FaPlus />
            </button>
            <button
              onClick={handleRemove}
              className="py-3 px-4 flex items-center justify-center hover:scale-105"
              style={{
                background: '#FFFFFF',
                border: '1px solid rgba(0,0,0,0.1)',
                borderRadius: '12px',
                boxShadow: '0 3px 10px rgba(0,0,0,0.08)',
                color: '#D93636',
                transition: 'all 0.2s ease'
              }}
            >
              <FaTrash />
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default ProductCard;
