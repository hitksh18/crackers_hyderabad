import { useState, useEffect, useRef } from 'react';
import { collection, getDocs, addDoc, doc, getDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { motion, AnimatePresence } from 'framer-motion';
import { FaPlus, FaMinus, FaTrash, FaPrint, FaSearch, FaShoppingBag, FaCreditCard, FaMobileAlt, FaMoneyBillWave, FaWhatsapp } from 'react-icons/fa';
import toast from 'react-hot-toast';

const Billing = () => {
  const [products, setProducts] = useState([]);
  const [billItems, setBillItems] = useState([]);
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [discount, setDiscount] = useState(0);
  const [paymentMode, setPaymentMode] = useState('Cash');
  const [whatsappNumber, setWhatsappNumber] = useState('+91 1234567890');
  const printRef = useRef();

  useEffect(() => {
    fetchProducts();
    fetchWhatsAppNumber();
  }, []);

  const fetchProducts = async () => {
    try {
      const snapshot = await getDocs(collection(db, 'products'));
      const productsList = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      setProducts(productsList);
    } catch (error) {
      console.error('Error fetching products:', error);
      toast.error('Failed to load products');
    } finally {
      setLoading(false);
    }
  };

  const fetchWhatsAppNumber = async () => {
    try {
      const adminDoc = await getDoc(doc(db, 'adminSettings', 'main'));
      if (adminDoc.exists() && adminDoc.data().whatsappNumber) {
        setWhatsappNumber(adminDoc.data().whatsappNumber);
      }
    } catch (error) {
      console.error('Error fetching WhatsApp number:', error);
    }
  };

  const addToBill = (product) => {
    const existingItem = billItems.find(item => item.id === product.id);
    if (existingItem) {
      setBillItems(billItems.map(item =>
        item.id === product.id
          ? { ...item, quantity: item.quantity + 1 }
          : item
      ));
      toast.success(`${product.name} quantity increased`);
    } else {
      setBillItems([{ ...product, quantity: 1, addedAt: Date.now() }, ...billItems]);
      toast.success(`${product.name} added to bill`);
    }
  };

  const updateQuantity = (id, change) => {
    setBillItems(billItems.map(item => {
      if (item.id === id) {
        const newQuantity = item.quantity + change;
        return newQuantity > 0 ? { ...item, quantity: newQuantity } : item;
      }
      return item;
    }).filter(item => item.quantity > 0));
  };

  const setDirectQuantity = (id, value) => {
    const qty = parseInt(value);
    if (isNaN(qty) || qty < 1) return;
    
    setBillItems(billItems.map(item => 
      item.id === id ? { ...item, quantity: qty } : item
    ));
  };

  const removeFromBill = (id) => {
    setBillItems(billItems.filter(item => item.id !== id));
    toast.success('Item removed from bill');
  };

  const calculateSubtotal = () => {
    return billItems.reduce((total, item) => {
      const price = item.offlineDiscountPrice || item.offlineMRP || item.offlinePrice || item.onlinePrice || 0;
      return total + (price * item.quantity);
    }, 0);
  };

  const calculateTotal = () => {
    const subtotal = calculateSubtotal();
    return Math.max(0, subtotal - discount);
  };

  const handlePrint = () => {
    window.print();
  };

  const saveBill = async () => {
    if (billItems.length === 0) {
      toast.error('Add items to the bill first');
      return;
    }

    if (!customerName || !customerPhone) {
      toast.error('Please enter customer name and phone number');
      return;
    }

    try {
      const billData = {
        customer: {
          name: customerName,
          phone: customerPhone
        },
        items: billItems.map(item => ({
          id: item.id,
          name: item.name,
          quantity: item.quantity,
          price: item.offlineDiscountPrice || item.offlineMRP || item.offlinePrice || item.onlinePrice || 0,
          total: (item.offlineDiscountPrice || item.offlineMRP || item.offlinePrice || item.onlinePrice || 0) * item.quantity
        })),
        subtotal: calculateSubtotal(),
        discount: discount,
        total: calculateTotal(),
        paymentMode: paymentMode,
        createdAt: new Date(),
        status: 'Completed'
      };

      await addDoc(collection(db, 'orders'), billData);
      toast.success('Bill saved successfully!');
      handlePrint();
      
      setTimeout(() => {
        clearBill();
      }, 500);
    } catch (error) {
      console.error('Error saving bill:', error);
      toast.error('Failed to save bill');
    }
  };

  const clearBill = () => {
    setBillItems([]);
    setCustomerName('');
    setCustomerPhone('');
    setDiscount(0);
    setPaymentMode('Cash');
    toast.success('Bill cleared');
  };

  const sendToWhatsApp = () => {
    if (billItems.length === 0) {
      toast.error('Add items to the bill first');
      return;
    }

    if (!customerName || !customerPhone) {
      toast.error('Please enter customer name and phone number');
      return;
    }

    const itemsList = billItems.map((item, index) => {
      const price = item.offlineDiscountPrice || item.offlineMRP || item.offlinePrice || item.onlinePrice || 0;
      const total = price * item.quantity;
      return `${index + 1}. ${item.name} - Qty: ${item.quantity} - ₹${price} = ₹${total}`;
    }).join('\n');

    const message = `*Crackers Hyderabad - Invoice*

📋 *Customer Details:*
Name: ${customerName}
Phone: ${customerPhone}
Payment Mode: ${paymentMode}

🛍️ *Order Items:*
${itemsList}

💰 *Bill Summary:*
Subtotal: ₹${calculateSubtotal().toFixed(2)}
${discount > 0 ? `Discount: -₹${discount.toFixed(2)}\n` : ''}Grand Total: ₹${calculateTotal().toFixed(2)}

📅 Date: ${new Date().toLocaleDateString()}
⏰ Time: ${new Date().toLocaleTimeString()}

Thank you for shopping with us! Have a safe and happy celebration! 🎆`;

    const encodedMessage = encodeURIComponent(message);
    
    const formattedCustomerPhone = customerPhone.startsWith('+') 
      ? customerPhone.replace(/[^0-9]/g, '') 
      : '91' + customerPhone.replace(/[^0-9]/g, '');
    
    const whatsappURL = `https://wa.me/${formattedCustomerPhone}?text=${encodedMessage}`;
    
    window.open(whatsappURL, '_blank');
    toast.success('Opening WhatsApp to send invoice to customer...');
  };

  const filteredProducts = products.filter(product => {
    const searchLower = searchQuery.toLowerCase();
    const nameMatch = product.name.toLowerCase().includes(searchLower);
    const categoryMatch = product.categories && Array.isArray(product.categories)
      ? product.categories.some(cat => cat.toLowerCase().includes(searchLower))
      : product.category.toLowerCase().includes(searchLower);
    return nameMatch || categoryMatch;
  });

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 via-primary-50/30 to-accent-50/30 py-6 px-4">
      <div className="max-w-7xl mx-auto">
        {/* Header with Search */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-6"
        >
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6">
            <div>
              <h1 className="text-2xl md:text-3xl font-display font-bold bg-gradient-to-r from-primary-800 to-accent-600 bg-clip-text text-transparent mb-1">
                Billing System
              </h1>
              <p className="text-sm text-gray-600">Create invoices for offline store sales</p>
            </div>
            <div className="flex gap-2">
              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={clearBill}
                className="px-4 py-2 bg-red-500 text-white rounded-xl hover:bg-red-600 font-semibold shadow-md"
              >
                Clear All
              </motion.button>
            </div>
          </div>

          {/* Search Bar - Top */}
          <div className="relative">
            <FaSearch className="absolute left-4 top-4 text-gray-400 text-base" />
            <input
              type="text"
              placeholder="Search products by name or category..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-12 pr-4 py-3 border-2 border-gray-200 rounded-xl focus:border-primary-500 focus:outline-none shadow-sm text-base"
            />
          </div>
        </motion.div>

        <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
          {/* Products List - 2 columns */}
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            className="lg:col-span-2 bg-white rounded-2xl shadow-lg p-5"
          >
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-gray-800 flex items-center gap-2">
                <FaShoppingBag className="text-primary-600 text-base" />
                Available Products
              </h2>
              <div className="bg-gray-100 px-3 py-1 rounded-full text-sm font-semibold text-gray-700">
                {filteredProducts.length} items
              </div>
            </div>
            
            <div className="max-h-[calc(100vh-240px)] overflow-y-auto space-y-2 pr-2">
              {loading ? (
                <div className="text-center py-12">
                  <div className="animate-spin rounded-full h-12 w-12 border-t-4 border-primary-600 mx-auto"></div>
                </div>
              ) : filteredProducts.length === 0 ? (
                <p className="text-center text-gray-500 py-12">No products found</p>
              ) : (
                filteredProducts.map(product => (
                  <motion.div
                    key={product.id}
                    whileHover={{ scale: 1.02, x: 5 }}
                    whileTap={{ scale: 0.98 }}
                    className="flex items-center justify-between p-3 border-2 border-gray-200 rounded-xl hover:border-primary-400 hover:shadow-md cursor-pointer transition-all"
                    onClick={() => addToBill(product)}
                  >
                    <div className="flex items-center gap-3 flex-1">
                      {product.imageURL && (
                        <img 
                          src={product.imageURL} 
                          alt={product.name} 
                          className="w-14 h-14 object-cover rounded-lg shadow-sm" 
                        />
                      )}
                      <div className="flex-1">
                        <h3 className="font-bold text-gray-800">{product.name}</h3>
                        <p className="text-xs text-gray-500">{product.category}</p>
                        {product.outOfStock && (
                          <p className="text-xs text-red-600 mt-1 font-semibold">Out of Stock</p>
                        )}
                      </div>
                    </div>
                    <div className="text-right">
                      {product.offlineDiscountPrice ? (
                        <>
                          <p className="font-bold text-green-600 text-lg">₹{product.offlineDiscountPrice}</p>
                          <p className="text-xs text-gray-400 line-through">₹{product.offlineMRP}</p>
                        </>
                      ) : (
                        <p className="font-bold text-primary-700 text-lg">₹{product.offlineMRP || product.offlinePrice || product.onlinePrice || 0}</p>
                      )}
                      <p className="text-xs text-accent-600 font-medium">+ Add</p>
                    </div>
                  </motion.div>
                ))
              )}
            </div>
          </motion.div>

          {/* Bill Section - 3 columns */}
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            className="lg:col-span-3 bg-white rounded-2xl shadow-lg p-6"
          >
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold text-gray-800">Current Bill</h2>
              <div className={`px-4 py-2 rounded-full font-bold ${
                billItems.length > 0 ? 'bg-primary-600 text-white' : 'bg-gray-200 text-gray-600'
              }`}>
                {billItems.length} {billItems.length === 1 ? 'Item' : 'Items'}
              </div>
            </div>

            {/* Customer Details */}
            <div className="grid md:grid-cols-2 gap-3 mb-5 p-4 bg-primary-50 rounded-xl">
              <input
                type="text"
                placeholder="Customer Name *"
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                className="px-4 py-3 border-2 border-gray-200 rounded-lg focus:border-primary-500 focus:outline-none font-medium"
              />
              <input
                type="tel"
                placeholder="Customer Phone *"
                value={customerPhone}
                onChange={(e) => setCustomerPhone(e.target.value)}
                className="px-4 py-3 border-2 border-gray-200 rounded-lg focus:border-primary-500 focus:outline-none font-medium"
              />
            </div>

            {/* Bill Items */}
            <div className="border-2 border-gray-200 rounded-xl p-4 mb-5 max-h-[calc(100vh-520px)] overflow-y-auto bg-gray-50">
              {billItems.length === 0 ? (
                <div className="text-center py-8">
                  <FaShoppingBag className="text-4xl text-gray-300 mx-auto mb-2" />
                  <p className="text-gray-500 text-base">No items in bill</p>
                  <p className="text-gray-400 text-sm mt-1">Click on products to add them</p>
                </div>
              ) : (
                <div className="space-y-2">
                  <AnimatePresence>
                    {billItems.map((item, index) => (
                      <motion.div
                        key={item.id}
                        initial={{ opacity: 0, y: -20 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, x: -100 }}
                        transition={{ delay: index * 0.05 }}
                        className="flex items-center justify-between p-3 bg-white rounded-lg border-2 border-gray-200 hover:border-primary-300"
                      >
                        <div className="flex items-center gap-3 flex-1">
                          <div className="bg-primary-100 text-primary-700 font-bold w-8 h-8 rounded-full flex items-center justify-center text-sm">
                            {index + 1}
                          </div>
                          <div className="flex-1">
                            <h3 className="font-bold text-gray-800 text-base">{item.name}</h3>
                            {item.offlineDiscountPrice ? (
                              <div className="flex items-center gap-2">
                                <p className="text-sm text-green-600 font-semibold">₹{item.offlineDiscountPrice} each</p>
                                <p className="text-xs text-gray-400 line-through">₹{item.offlineMRP}</p>
                              </div>
                            ) : (
                              <p className="text-sm text-gray-600">₹{item.offlineMRP || item.offlinePrice || item.onlinePrice || 0} each</p>
                            )}
                          </div>
                        </div>
                        
                        {/* Quantity Controls */}
                        <div className="flex items-center gap-2 mx-4">
                          <motion.button
                            whileHover={{ scale: 1.1 }}
                            whileTap={{ scale: 0.9 }}
                            onClick={() => updateQuantity(item.id, -1)}
                            className="w-8 h-8 flex items-center justify-center bg-red-100 hover:bg-red-200 text-red-600 rounded-lg font-bold"
                          >
                            <FaMinus className="text-xs" />
                          </motion.button>
                          
                          <input
                            type="number"
                            min="1"
                            value={item.quantity}
                            onChange={(e) => setDirectQuantity(item.id, e.target.value)}
                            className="w-16 text-center font-bold text-lg border-2 border-gray-300 rounded-lg py-1 focus:border-primary-500 focus:outline-none"
                          />
                          
                          <motion.button
                            whileHover={{ scale: 1.1 }}
                            whileTap={{ scale: 0.9 }}
                            onClick={() => updateQuantity(item.id, 1)}
                            className="w-8 h-8 flex items-center justify-center bg-green-100 hover:bg-green-200 text-green-600 rounded-lg font-bold"
                          >
                            <FaPlus className="text-xs" />
                          </motion.button>
                          
                          <motion.button
                            whileHover={{ scale: 1.1 }}
                            whileTap={{ scale: 0.9 }}
                            onClick={() => removeFromBill(item.id)}
                            className="w-8 h-8 flex items-center justify-center bg-red-500 hover:bg-red-600 text-white rounded-lg ml-2"
                          >
                            <FaTrash className="text-xs" />
                          </motion.button>
                        </div>
                        
                        <div className="text-right min-w-[80px]">
                          <p className="font-bold text-primary-700 text-lg">
                            ₹{((item.offlinePrice || item.onlinePrice || 0) * item.quantity).toFixed(2)}
                          </p>
                        </div>
                      </motion.div>
                    ))}
                  </AnimatePresence>
                </div>
              )}
            </div>

            {/* Totals and Payment */}
            <div className="space-y-4">
              {/* Subtotal */}
              <div className="flex justify-between text-lg p-3 bg-gray-100 rounded-lg">
                <span className="font-semibold">Subtotal:</span>
                <span className="font-bold">₹{calculateSubtotal().toFixed(2)}</span>
              </div>

              {/* Discount Input */}
              <div className="flex items-center justify-between gap-4 p-3 bg-accent-50 rounded-lg">
                <label className="font-semibold text-gray-700">Discount:</label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={discount}
                  onChange={(e) => setDiscount(parseFloat(e.target.value) || 0)}
                  placeholder="0.00"
                  className="w-32 px-4 py-2 border-2 border-gray-300 rounded-lg focus:border-accent-500 focus:outline-none font-bold text-right"
                />
              </div>

              {/* Final Total */}
              <div className="flex justify-between text-2xl font-bold p-4 bg-gradient-to-r from-primary-600 to-accent-600 text-white rounded-xl">
                <span>Total:</span>
                <span>₹{calculateTotal().toFixed(2)}</span>
              </div>

              {/* Payment Mode */}
              <div className="p-4 bg-gray-50 rounded-xl">
                <label className="block font-semibold text-gray-700 mb-3">Payment Mode:</label>
                <div className="grid grid-cols-3 gap-3">
                  {[
                    { mode: 'Cash', icon: FaMoneyBillWave, color: 'green' },
                    { mode: 'Card', icon: FaCreditCard, color: 'blue' },
                    { mode: 'UPI', icon: FaMobileAlt, color: 'purple' }
                  ].map(({ mode, icon: Icon, color }) => (
                    <motion.button
                      key={mode}
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.95 }}
                      onClick={() => setPaymentMode(mode)}
                      className={`flex flex-col items-center justify-center gap-1 py-3 rounded-xl border-2 font-semibold text-sm transition-all ${
                        paymentMode === mode
                          ? `bg-${color}-100 border-${color}-500 text-${color}-700`
                          : 'bg-white border-gray-200 text-gray-600 hover:border-gray-400'
                      }`}
                    >
                      <Icon className="text-lg" />
                      <span>{mode}</span>
                    </motion.button>
                  ))}
                </div>
              </div>

              {/* Action Buttons */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-2">
                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={saveBill}
                  disabled={billItems.length === 0}
                  className="flex items-center justify-center gap-2 px-6 py-3 bg-gradient-to-r from-green-500 to-green-600 text-white rounded-xl font-bold text-base hover:from-green-600 hover:to-green-700 disabled:from-gray-400 disabled:to-gray-400 shadow-lg"
                >
                  <FaPrint />
                  Print & Save
                </motion.button>
                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={sendToWhatsApp}
                  disabled={billItems.length === 0}
                  className="flex items-center justify-center gap-2 px-6 py-3 bg-gradient-to-r from-green-600 to-emerald-600 text-white rounded-xl font-bold text-base hover:from-green-700 hover:to-emerald-700 disabled:from-gray-400 disabled:to-gray-400 shadow-lg"
                >
                  <FaWhatsapp />
                  Send to WhatsApp
                </motion.button>
                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={clearBill}
                  className="px-6 py-3 bg-red-500 text-white rounded-xl font-bold text-base hover:bg-red-600 shadow-lg"
                >
                  Clear Bill
                </motion.button>
              </div>
            </div>
          </motion.div>
        </div>
      </div>

      {/* Print Template - Hidden on screen, visible only when printing */}
      <div className="print-only">
        <div ref={printRef} style={{ padding: '20px', maxWidth: '800px', margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: '20px', borderBottom: '2px solid #000', paddingBottom: '15px' }}>
            <h1 style={{ fontSize: '28px', fontWeight: 'bold', margin: '0 0 5px 0' }}>Crackers Hyderabad</h1>
            <p style={{ fontSize: '14px', color: '#666', margin: '0' }}>Premium Quality Fireworks</p>
            <p style={{ fontSize: '12px', color: '#999', margin: '5px 0 0 0' }}>
              Date: {new Date().toLocaleDateString()} | Time: {new Date().toLocaleTimeString()}
            </p>
          </div>

          <div style={{ marginBottom: '20px', padding: '15px', border: '1px solid #ddd', borderRadius: '8px', backgroundColor: '#f9f9f9' }}>
            <p style={{ fontSize: '14px', margin: '5px 0' }}><strong>Customer Name:</strong> {customerName}</p>
            <p style={{ fontSize: '14px', margin: '5px 0' }}><strong>Mobile Number:</strong> {customerPhone}</p>
            <p style={{ fontSize: '14px', margin: '5px 0' }}><strong>Payment Mode:</strong> {paymentMode}</p>
          </div>

          <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '20px', fontSize: '13px' }}>
            <thead>
              <tr style={{ borderBottom: '2px solid #333', backgroundColor: '#f5f5f5' }}>
                <th style={{ padding: '10px 5px', textAlign: 'left', width: '40px' }}>#</th>
                <th style={{ padding: '10px 5px', textAlign: 'left' }}>Product Name</th>
                <th style={{ padding: '10px 5px', textAlign: 'center', width: '60px' }}>Qty</th>
                <th style={{ padding: '10px 5px', textAlign: 'right', width: '90px' }}>MRP</th>
                <th style={{ padding: '10px 5px', textAlign: 'right', width: '90px' }}>Price</th>
                <th style={{ padding: '10px 5px', textAlign: 'right', width: '100px' }}>Total</th>
              </tr>
            </thead>
            <tbody>
              {billItems.map((item, index) => {
                const mrp = item.offlineMRP || item.offlinePrice || item.onlinePrice || 0;
                const price = item.offlineDiscountPrice || item.offlineMRP || item.offlinePrice || item.onlinePrice || 0;
                const total = price * item.quantity;
                
                return (
                  <tr key={item.id} style={{ borderBottom: '1px solid #ddd' }}>
                    <td style={{ padding: '10px 5px', textAlign: 'left' }}>{index + 1}</td>
                    <td style={{ padding: '10px 5px', textAlign: 'left' }}>{item.name}</td>
                    <td style={{ padding: '10px 5px', textAlign: 'center', fontWeight: 'bold' }}>{item.quantity}</td>
                    <td style={{ padding: '10px 5px', textAlign: 'right', textDecoration: item.offlineDiscountPrice ? 'line-through' : 'none', color: item.offlineDiscountPrice ? '#999' : '#000' }}>
                      ₹{mrp.toFixed(2)}
                    </td>
                    <td style={{ padding: '10px 5px', textAlign: 'right', fontWeight: item.offlineDiscountPrice ? 'bold' : 'normal', color: item.offlineDiscountPrice ? '#16a34a' : '#000' }}>
                      ₹{price.toFixed(2)}
                    </td>
                    <td style={{ padding: '10px 5px', textAlign: 'right', fontWeight: 'bold' }}>₹{total.toFixed(2)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          <div style={{ marginTop: '20px', padding: '15px', borderTop: '2px solid #333' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '14px', marginBottom: '8px' }}>
              <span>Subtotal:</span>
              <span style={{ fontWeight: 'bold' }}>₹{calculateSubtotal().toFixed(2)}</span>
            </div>
            {discount > 0 && (
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '14px', marginBottom: '8px', color: '#16a34a' }}>
                <span>Discount:</span>
                <span style={{ fontWeight: 'bold' }}>- ₹{discount.toFixed(2)}</span>
              </div>
            )}
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '18px', fontWeight: 'bold', marginTop: '12px', paddingTop: '12px', borderTop: '2px solid #000' }}>
              <span>Grand Total:</span>
              <span>₹{calculateTotal().toFixed(2)}</span>
            </div>
          </div>

          <div style={{ textAlign: 'center', marginTop: '30px', paddingTop: '15px', borderTop: '1px dashed #999', fontSize: '12px', color: '#666' }}>
            <p style={{ margin: '5px 0', fontWeight: 'bold' }}>Thank you for your purchase!</p>
            <p style={{ margin: '5px 0' }}>Have a safe and happy celebration!</p>
            <p style={{ margin: '10px 0 0 0', fontSize: '11px' }}>For any queries, please contact us</p>
          </div>
        </div>
      </div>

      <style>{`
        @media print {
          body * {
            visibility: hidden;
          }
          .print-only, .print-only * {
            visibility: visible;
          }
          .print-only {
            position: absolute;
            left: 0;
            top: 0;
            width: 100%;
          }
        }
        @media screen {
          .print-only {
            display: none;
          }
        }
      `}</style>
    </div>
  );
};

export default Billing;
