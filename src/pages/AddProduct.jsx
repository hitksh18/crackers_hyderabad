import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { collection, addDoc, getDocs } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { db, storage } from '../firebase';
import { useNavigate, Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import { FaArrowLeft, FaImage, FaPlus, FaTimes, FaSearch } from 'react-icons/fa';

const categories = ['Gift Boxes', 'Kids Special', 'Sparklers', 'Flower Pots', 'Chakkars', 'Garlands', 'Fancy', 'Rockets & Novelties', 'Bombs', 'Guns-Rolls'];

const AddProduct = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [imageFile, setImageFile] = useState(null);
  const [imagePreview, setImagePreview] = useState('');
  const [imageURL, setImageURL] = useState('');
  const [useURL, setUseURL] = useState(false);
  const [brands, setBrands] = useState([]);
  const [showAddBrand, setShowAddBrand] = useState(false);
  const [newBrandName, setNewBrandName] = useState('');
  const [newBrandLogo, setNewBrandLogo] = useState('');
  const [newBrandDescription, setNewBrandDescription] = useState('');
  const [brandLogoFile, setBrandLogoFile] = useState(null);
  const [uploadingBrandLogo, setUploadingBrandLogo] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    categories: [],
    onlinePrice: '',
    discountPrice: '',
    offlineMRP: '',
    offlineDiscountPrice: '',
    outOfStock: false,
    description: '',
    isFeatured: false,
    brand: '',
  });
  const [seoData, setSeoData] = useState({
    title: '',
    description: '',
    keywords: '',
    slug: '',
    tags: '',
  });

  useEffect(() => {
    fetchBrands();
  }, []);

  const fetchBrands = async () => {
    try {
      const snapshot = await getDocs(collection(db, 'brands'));
      const brandsList = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      setBrands(brandsList);
    } catch (error) {
      console.error('Error fetching brands:', error);
    }
  };

  const handleBrandLogoFileChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      setBrandLogoFile(file);
      const reader = new FileReader();
      reader.onloadend = () => {
        setNewBrandLogo(reader.result);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleAddBrand = async () => {
    if (!newBrandName.trim()) {
      toast.error('Please enter a brand name');
      return;
    }

    try {
      setUploadingBrandLogo(true);
      let logoURL = newBrandLogo.trim();

      if (brandLogoFile) {
        try {
          const storageRef = ref(storage, `brands/${Date.now()}_${brandLogoFile.name}`);
          await uploadBytes(storageRef, brandLogoFile);
          logoURL = await getDownloadURL(storageRef);
        } catch (uploadError) {
          console.error('Logo upload failed:', uploadError);
          toast.error('Logo upload failed. Using URL instead if provided.');
          logoURL = newBrandLogo.startsWith('data:') ? '' : newBrandLogo.trim();
        }
      }

      const brandData = {
        name: newBrandName.trim(),
        logo: logoURL,
        description: newBrandDescription.trim() || '',
        createdAt: new Date()
      };
      
      const docRef = await addDoc(collection(db, 'brands'), brandData);
      
      setBrands([...brands, { id: docRef.id, ...brandData }]);
      setFormData({ ...formData, brand: newBrandName.trim() });
      setNewBrandName('');
      setNewBrandLogo('');
      setNewBrandDescription('');
      setBrandLogoFile(null);
      setShowAddBrand(false);
      toast.success('Brand added successfully!');
    } catch (error) {
      console.error('Error adding brand:', error);
      toast.error('Failed to add brand. Please check Firebase permissions.');
    } finally {
      setUploadingBrandLogo(false);
    }
  };

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleSeoChange = (e) => {
    setSeoData({ ...seoData, [e.target.name]: e.target.value });
  };

  const handleCategoryToggle = (category) => {
    setFormData(prev => ({
      ...prev,
      categories: prev.categories.includes(category)
        ? prev.categories.filter(c => c !== category)
        : [...prev.categories, category]
    }));
  };

  const handleImageChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      setImageFile(file);
      setImagePreview(URL.createObjectURL(file));
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!formData.name || !formData.onlinePrice || !formData.offlineMRP) {
      toast.error('Please fill all required fields (name, online price, offline MRP)');
      return;
    }

    if (formData.categories.length === 0) {
      toast.error('Please select at least one category');
      return;
    }

    setLoading(true);

    try {
      let finalImageURL = '';

      if (useURL && imageURL) {
        finalImageURL = imageURL;
      } else if (imageFile) {
        toast.error('File upload is not available. Please use "Use Image URL" option instead.');
        setLoading(false);
        return;
      }

      const seoObject = {
        title: seoData.title || formData.name,
        description: seoData.description || formData.description,
        keywords: seoData.keywords ? seoData.keywords.split(',').map(k => k.trim()).filter(k => k) : [],
        slug: seoData.slug || formData.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, ''),
        tags: seoData.tags ? seoData.tags.split(',').map(t => t.trim()).filter(t => t) : []
      };

      const productData = {
        name: formData.name,
        categories: formData.categories,
        category: formData.categories[0],
        onlinePrice: parseFloat(formData.onlinePrice),
        discountPrice: formData.discountPrice ? parseFloat(formData.discountPrice) : null,
        offlineMRP: parseFloat(formData.offlineMRP),
        offlineDiscountPrice: formData.offlineDiscountPrice ? parseFloat(formData.offlineDiscountPrice) : null,
        outOfStock: formData.outOfStock,
        description: formData.description,
        imageURL: finalImageURL,
        isFeatured: formData.isFeatured,
        brand: formData.brand || null,
        seo: seoObject,
        salesCount: 0,
        createdAt: new Date(),
      };

      await addDoc(collection(db, 'products'), productData);
      toast.success('Product added successfully!');
      navigate('/admin/dashboard');
    } catch (error) {
      console.error('Error adding product:', error);
      toast.error('Failed to add product');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4 md:px-8">
      <div className="max-w-3xl mx-auto">
        <Link to="/admin/dashboard" className="inline-flex items-center text-purple-600 hover:text-purple-800 mb-6">
          <FaArrowLeft className="mr-2" />
          Back to Dashboard
        </Link>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white rounded-lg shadow-md p-8"
        >
          <h1 className="text-3xl font-bold text-purple-900 mb-6">Add New Product</h1>

          <form onSubmit={handleSubmit} className="space-y-6">
            <div>
              <label className="block text-gray-700 font-semibold mb-2">Product Image</label>
              
              <div className="flex gap-4 mb-4">
                <button
                  type="button"
                  onClick={() => {
                    setUseURL(true);
                    toast.info('Use Image URL is recommended. File upload requires Firebase Storage upgrade.');
                  }}
                  className="flex-1 bg-gradient-to-r from-accent-500 to-accent-600 text-white px-6 py-3 rounded-lg font-semibold hover:from-accent-600 hover:to-accent-700 transition shadow-lg"
                >
                  Use Image URL (Recommended)
                </button>
              </div>

              {useURL ? (
                <div>
                  <input
                    type="url"
                    value={imageURL}
                    onChange={(e) => {
                      setImageURL(e.target.value);
                      setImagePreview(e.target.value);
                    }}
                    placeholder="https://example.com/image.jpg"
                    className="w-full px-4 py-2 border-2 border-gray-300 rounded-lg focus:border-purple-500 focus:outline-none mb-4"
                  />
                  {imagePreview && (
                    <img src={imagePreview} alt="Preview" className="w-32 h-32 object-cover rounded-lg" />
                  )}
                </div>
              ) : (
                <div className="flex items-center gap-4">
                  {imagePreview ? (
                    <img src={imagePreview} alt="Preview" className="w-32 h-32 object-cover rounded-lg" />
                  ) : (
                    <div className="w-32 h-32 bg-gray-200 rounded-lg flex items-center justify-center">
                      <FaImage className="text-4xl text-gray-400" />
                    </div>
                  )}
                  <div className="flex-1">
                    <input
                      type="file"
                      accept="image/*"
                      onChange={handleImageChange}
                      className="w-full"
                    />
                    <p className="text-xs text-gray-500 mt-2">Note: Firebase Storage requires a paid plan. Use image URL instead if upload fails.</p>
                  </div>
                </div>
              )}
            </div>

            <div>
              <label className="block text-gray-700 font-semibold mb-2">Product Name *</label>
              <input
                type="text"
                name="name"
                value={formData.name}
                onChange={handleChange}
                className="w-full px-4 py-2 border-2 border-gray-300 rounded-lg focus:border-purple-500 focus:outline-none"
                required
              />
            </div>

            <div>
              <label className="block text-gray-700 font-semibold mb-2">Product Brand</label>
              <div className="flex gap-2">
                <select
                  name="brand"
                  value={formData.brand}
                  onChange={handleChange}
                  className="flex-1 px-4 py-2 border-2 border-gray-300 rounded-lg focus:border-purple-500 focus:outline-none bg-white"
                >
                  <option value="">Select Brand (Optional)</option>
                  {brands.map(brand => (
                    <option key={brand.id} value={brand.name}>{brand.name}</option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={() => setShowAddBrand(true)}
                  className="px-4 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 transition flex items-center gap-2"
                >
                  <FaPlus />
                  Add Brand
                </button>
              </div>
            </div>

            <div>
              <label className="block text-gray-700 font-semibold mb-3">Categories * (Select all that apply)</label>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                {categories.map(cat => (
                  <label
                    key={cat}
                    className={`flex items-center gap-2 px-4 py-3 rounded-lg border-2 cursor-pointer transition-all ${
                      formData.categories.includes(cat)
                        ? 'border-purple-500 bg-purple-50'
                        : 'border-gray-300 hover:border-purple-300'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={formData.categories.includes(cat)}
                      onChange={() => handleCategoryToggle(cat)}
                      className="w-4 h-4 text-purple-600"
                    />
                    <span className="text-sm font-medium text-gray-700">{cat}</span>
                  </label>
                ))}
              </div>
              <p className="text-xs text-gray-500 mt-2">Products can belong to multiple categories for better filtering</p>
            </div>

            <div className="space-y-4">
              <div className="border-2 border-blue-200 rounded-lg p-4 bg-blue-50">
                <h3 className="font-bold text-gray-800 mb-3">Website Prices (Online)</h3>
                <div className="grid md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-gray-700 font-semibold mb-2">Online Price *</label>
                    <input
                      type="number"
                      step="0.01"
                      name="onlinePrice"
                      value={formData.onlinePrice}
                      onChange={handleChange}
                      placeholder="₹376"
                      className="w-full px-4 py-2 border-2 border-gray-300 rounded-lg focus:border-purple-500 focus:outline-none"
                      required
                    />
                    <p className="text-xs text-gray-500 mt-1">Regular website price</p>
                  </div>
                  <div>
                    <label className="block text-gray-700 font-semibold mb-2">Discount Price</label>
                    <input
                      type="number"
                      step="0.01"
                      name="discountPrice"
                      value={formData.discountPrice}
                      onChange={handleChange}
                      placeholder="₹347"
                      className="w-full px-4 py-2 border-2 border-gray-300 rounded-lg focus:border-purple-500 focus:outline-none"
                    />
                    <p className="text-xs text-gray-500 mt-1">Sale price (optional)</p>
                  </div>
                </div>
              </div>

              <div className="border-2 border-purple-200 rounded-lg p-4 bg-purple-50">
                <h3 className="font-bold text-gray-800 mb-3">Store Prices (Offline)</h3>
                <div className="grid md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-gray-700 font-semibold mb-2">MRP (Offline) *</label>
                    <input
                      type="number"
                      step="0.01"
                      name="offlineMRP"
                      value={formData.offlineMRP}
                      onChange={handleChange}
                      placeholder="₹400"
                      className="w-full px-4 py-2 border-2 border-gray-300 rounded-lg focus:border-purple-500 focus:outline-none"
                      required
                    />
                    <p className="text-xs text-gray-500 mt-1">Regular store price</p>
                  </div>
                  <div>
                    <label className="block text-gray-700 font-semibold mb-2">Discount Price (Offline)</label>
                    <input
                      type="number"
                      step="0.01"
                      name="offlineDiscountPrice"
                      value={formData.offlineDiscountPrice}
                      onChange={handleChange}
                      placeholder="₹350"
                      className="w-full px-4 py-2 border-2 border-gray-300 rounded-lg focus:border-purple-500 focus:outline-none"
                    />
                    <p className="text-xs text-gray-500 mt-1">Store sale price (optional)</p>
                  </div>
                </div>
                <p className="text-xs text-blue-600 mt-2 font-medium">Used in billing system for in-store sales</p>
              </div>
            </div>

            <div>
              <label className="block text-gray-700 font-semibold mb-2">Description</label>
              <textarea
                name="description"
                value={formData.description}
                onChange={handleChange}
                rows="4"
                className="w-full px-4 py-2 border-2 border-gray-300 rounded-lg focus:border-purple-500 focus:outline-none"
              ></textarea>
            </div>

            <div className="border-2 border-green-200 rounded-lg p-4 bg-green-50">
              <h3 className="font-bold text-gray-800 mb-3 flex items-center gap-2">
                <FaSearch className="text-green-600" />
                SEO Settings
              </h3>
              <div className="space-y-4">
                <div>
                  <label className="block text-gray-700 font-semibold mb-2">SEO Title</label>
                  <input
                    type="text"
                    name="title"
                    value={seoData.title}
                    onChange={handleSeoChange}
                    placeholder="Enter SEO title (defaults to product name)"
                    className="w-full px-4 py-2 border-2 border-gray-300 rounded-lg focus:border-green-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-gray-700 font-semibold mb-2">SEO Description</label>
                  <textarea
                    name="description"
                    value={seoData.description}
                    onChange={handleSeoChange}
                    rows="2"
                    placeholder="Enter SEO description for search engines"
                    className="w-full px-4 py-2 border-2 border-gray-300 rounded-lg focus:border-green-500 focus:outline-none"
                  ></textarea>
                </div>
                <div className="grid md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-gray-700 font-semibold mb-2">SEO Keywords</label>
                    <input
                      type="text"
                      name="keywords"
                      value={seoData.keywords}
                      onChange={handleSeoChange}
                      placeholder="fireworks, crackers, diwali (comma separated)"
                      className="w-full px-4 py-2 border-2 border-gray-300 rounded-lg focus:border-green-500 focus:outline-none"
                    />
                    <p className="text-xs text-gray-500 mt-1">Comma separated keywords</p>
                  </div>
                  <div>
                    <label className="block text-gray-700 font-semibold mb-2">SEO Slug</label>
                    <input
                      type="text"
                      name="slug"
                      value={seoData.slug}
                      onChange={handleSeoChange}
                      placeholder="product-url-slug"
                      className="w-full px-4 py-2 border-2 border-gray-300 rounded-lg focus:border-green-500 focus:outline-none"
                    />
                    <p className="text-xs text-gray-500 mt-1">URL-friendly name</p>
                  </div>
                </div>
                <div>
                  <label className="block text-gray-700 font-semibold mb-2">SEO Tags</label>
                  <input
                    type="text"
                    name="tags"
                    value={seoData.tags}
                    onChange={handleSeoChange}
                    placeholder="diwali, celebration, festival (comma separated)"
                    className="w-full px-4 py-2 border-2 border-gray-300 rounded-lg focus:border-green-500 focus:outline-none"
                  />
                  <p className="text-xs text-gray-500 mt-1">Comma separated tags for categorization</p>
                </div>
              </div>
            </div>

            <div className="grid md:grid-cols-2 gap-4">
              <div className="flex items-center gap-3 bg-accent-50 p-4 rounded-lg">
                <input
                  type="checkbox"
                  id="isFeatured"
                  checked={formData.isFeatured}
                  onChange={(e) => setFormData({ ...formData, isFeatured: e.target.checked })}
                  className="w-5 h-5 text-accent-600 border-gray-300 rounded focus:ring-accent-500"
                />
                <label htmlFor="isFeatured" className="text-gray-700 font-semibold cursor-pointer">
                  Mark as Featured Product
                </label>
              </div>
              <div className="flex items-center gap-3 bg-red-50 p-4 rounded-lg">
                <input
                  type="checkbox"
                  id="outOfStock"
                  checked={formData.outOfStock}
                  onChange={(e) => setFormData({ ...formData, outOfStock: e.target.checked })}
                  className="w-5 h-5 text-red-600 border-gray-300 rounded focus:ring-red-500"
                />
                <label htmlFor="outOfStock" className="text-gray-700 font-semibold cursor-pointer">
                  Out of Stock
                </label>
              </div>
            </div>

            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              type="submit"
              disabled={loading}
              className="w-full bg-purple-600 text-white py-3 rounded-lg font-bold hover:bg-purple-700 disabled:bg-gray-400"
            >
              {loading ? 'Adding Product...' : 'Add Product'}
            </motion.button>
          </form>
        </motion.div>
      </div>

      <AnimatePresence>
        {showAddBrand && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
            onClick={() => setShowAddBrand(false)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="bg-gradient-to-r from-green-500 to-green-600 text-white p-6">
                <div className="flex justify-between items-center">
                  <h2 className="text-xl font-bold">Add New Brand</h2>
                  <button
                    onClick={() => setShowAddBrand(false)}
                    className="p-2 hover:bg-white/20 rounded-lg transition"
                  >
                    <FaTimes />
                  </button>
                </div>
              </div>
              <div className="p-6 space-y-4">
                <div>
                  <label className="block text-gray-700 font-semibold mb-2">Brand Name *</label>
                  <input
                    type="text"
                    value={newBrandName}
                    onChange={(e) => setNewBrandName(e.target.value)}
                    placeholder="Enter brand name"
                    className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:border-green-500 focus:outline-none"
                    autoFocus
                  />
                </div>
                <div>
                  <label className="block text-gray-700 font-semibold mb-2">Brand Logo</label>
                  <div className="space-y-3">
                    <div className="flex gap-2">
                      <input
                        type="url"
                        value={brandLogoFile ? '' : newBrandLogo}
                        onChange={(e) => {
                          setNewBrandLogo(e.target.value);
                          setBrandLogoFile(null);
                        }}
                        placeholder="Enter logo URL or upload file"
                        className="flex-1 px-4 py-3 border-2 border-gray-300 rounded-lg focus:border-green-500 focus:outline-none"
                        disabled={!!brandLogoFile}
                      />
                    </div>
                    <div className="flex items-center gap-3">
                      <label className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg cursor-pointer hover:bg-gray-200 transition text-sm font-medium flex items-center gap-2">
                        <FaImage className="text-gray-500" />
                        Upload Logo
                        <input
                          type="file"
                          accept="image/*"
                          onChange={handleBrandLogoFileChange}
                          className="hidden"
                        />
                      </label>
                      {brandLogoFile && (
                        <span className="text-sm text-green-600">{brandLogoFile.name}</span>
                      )}
                    </div>
                  </div>
                  {newBrandLogo && (
                    <div className="mt-3 flex items-center gap-2">
                      <img 
                        src={newBrandLogo} 
                        alt="Logo preview" 
                        className="w-16 h-16 object-contain border rounded-lg bg-gray-50"
                        onError={(e) => e.target.style.display = 'none'}
                      />
                      <span className="text-sm text-gray-500">Logo Preview</span>
                    </div>
                  )}
                </div>
                <div>
                  <label className="block text-gray-700 font-semibold mb-2">Brand Description</label>
                  <textarea
                    value={newBrandDescription}
                    onChange={(e) => setNewBrandDescription(e.target.value)}
                    placeholder="Enter brand description (optional)"
                    rows={3}
                    className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:border-green-500 focus:outline-none resize-none"
                  />
                </div>
                <div className="flex gap-3 pt-2">
                  <button
                    onClick={() => {
                      setShowAddBrand(false);
                      setNewBrandName('');
                      setNewBrandLogo('');
                      setNewBrandDescription('');
                      setBrandLogoFile(null);
                    }}
                    className="flex-1 px-4 py-3 border-2 border-gray-300 text-gray-700 rounded-lg font-semibold hover:bg-gray-50 transition"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleAddBrand}
                    disabled={uploadingBrandLogo}
                    className="flex-1 px-4 py-3 bg-green-500 text-white rounded-lg font-semibold hover:bg-green-600 transition disabled:bg-gray-400"
                  >
                    {uploadingBrandLogo ? 'Adding...' : 'Add Brand'}
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default AddProduct;
