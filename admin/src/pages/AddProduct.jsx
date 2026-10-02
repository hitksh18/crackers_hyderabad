import { useState, useEffect } from 'react';
import { collection, addDoc, getDocs, updateDoc, doc } from 'firebase/firestore';
import { db } from '../firebase';
import { uploadImage } from '../utils/uploadImage';
import { useNavigate } from 'react-router-dom';
import toast from '../utils/toast';
import BrandDialog from '../components/admin/BrandDialog';
import ProductForm from '../components/admin/ProductForm';
import { saveTradePricing, stripTradeFields } from '../lib/tradePricing';
import { slugify, ensureUniqueSlug } from '../lib/productLinks';

const AddProduct = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [imageFile, setImageFile] = useState(null);
  const [imagePreview, setImagePreview] = useState('');
  const [imageURL, setImageURL] = useState('');
  const [useURL, setUseURL] = useState(false);
  const [imageProgress, setImageProgress] = useState(null);
  const [submitAttempted, setSubmitAttempted] = useState(false);
  const [touched, setTouched] = useState({});
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
    sortOrder: '',
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
          toast.loading('Removing background from logo...', { id: 'brand-logo-upload' });
          logoURL = await uploadImage(brandLogoFile, {
            dir: 'brands',
            removeBackground: true,
            watermark: false,
            onProgress: (key, current, total) => {
              if (total > 0) {
                const pct = Math.min(100, Math.round((current / total) * 100));
                toast.loading(`Processing logo... ${pct}%`, { id: 'brand-logo-upload' });
              }
            }
          });
          toast.dismiss('brand-logo-upload');
        } catch (uploadError) {
          toast.dismiss('brand-logo-upload');
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
      setImagePreview((prev) => {
        if (prev && prev.startsWith('blob:')) URL.revokeObjectURL(prev);
        return URL.createObjectURL(file);
      });
    }
  };

  const handleImageURLChange = (e) => {
    setImageURL(e.target.value);
    setImagePreview(e.target.value);
  };

  const handleToggleUseURL = (val) => {
    if (typeof val === 'boolean') {
      setUseURL(val);
    } else {
      setUseURL(v => !v);
    }
    if (!val) {
      setImageFile(null);
      setImagePreview('');
    }
  };

  const markTouched = (e) => {
    const key = e.target.name;
    if (!key) return;
    setTouched(prev => (prev[key] ? prev : { ...prev, [key]: true }));
  };

  const handleSubmit = async (e) => {
    if (e) e.preventDefault();
    setSubmitAttempted(true);

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

      if (imageFile) {
        toast.loading('Removing background from image...', { id: 'product-img-upload' });
        setImageProgress(0);
        try {
          finalImageURL = await uploadImage(imageFile, {
            dir: 'products',
            removeBackground: true,
            onProgress: (key, current, total) => {
              if (total > 0) {
                const pct = Math.min(100, Math.round((current / total) * 100));
                setImageProgress(pct);
                toast.loading(`Processing image... ${pct}%`, { id: 'product-img-upload' });
              }
            }
          });
        } catch (uploadError) {
          toast.error(uploadError.message || 'Image upload failed', { id: 'product-img-upload' });
          setImageProgress(null);
          setLoading(false);
          return;
        }
        toast.success('Image uploaded', { id: 'product-img-upload' });
        setImageProgress(100);
      } else if (imageURL) {
        finalImageURL = imageURL;
      }

      const seoObject = {
        title: seoData.title || formData.name,
        description: seoData.description || formData.description,
        keywords: seoData.keywords ? seoData.keywords.split(',').map(k => k.trim()).filter(k => k) : [],
        slug: seoData.slug || slugify(formData.name),
        tags: seoData.tags ? seoData.tags.split(',').map(t => t.trim()).filter(t => t) : []
      };

      let slug;
      try {
        slug = await ensureUniqueSlug(seoObject.slug || formData.name);
      } catch {
        slug = slugify(seoObject.slug || formData.name);
      }
      seoObject.slug = slug;

      const productData = {
        name: formData.name,
        categories: formData.categories,
        category: formData.categories[0],
        onlinePrice: parseFloat(formData.onlinePrice),
        discountPrice: formData.discountPrice ? parseFloat(formData.discountPrice) : null,
        outOfStock: formData.outOfStock,
        description: formData.description,
        imageURL: finalImageURL,
        isFeatured: formData.isFeatured,
        ...(formData.sortOrder !== '' ? { sortOrder: parseInt(formData.sortOrder, 10) } : {}),
        brand: formData.brand || null,
        seo: seoObject,
        slug,
        oldSlugs: [],
        salesCount: 0,
        createdAt: new Date(),
      };

      const productRef = await addDoc(collection(db, 'products'), stripTradeFields(productData));

      try {
        await saveTradePricing(productRef.id, formData);
      } catch (pricingError) {
        console.error('Error saving trade pricing:', pricingError);
        try {
          await updateDoc(doc(db, 'products', productRef.id), { outOfStock: true });
        } catch (stockError) {
          console.error('Could not mark the product out of stock:', stockError);
        }
        toast.error(
          'Product saved but the store prices did not. It has been marked out of stock — add the prices from Edit Product to make it sellable.',
          { duration: 9000 }
        );
        navigate('/products');
        return;
      }

      toast.success('Product added successfully!');
      navigate('/products');
    } catch (error) {
      console.error('Error adding product:', error);
      toast.error('Failed to add product');
    } finally {
      setLoading(false);
      setImageProgress(null);
    }
  };

  const revealed = (field) => submitAttempted || !!touched[field];
  const errors = {
    name: revealed('name') && !formData.name ? 'Product name is required.' : '',
    onlinePrice: revealed('onlinePrice') && !formData.onlinePrice ? 'Online price is required.' : '',
    offlineMRP: revealed('offlineMRP') && !formData.offlineMRP ? 'Offline MRP is required.' : '',
    categories: submitAttempted && formData.categories.length === 0 ? 'Select at least one category.' : '',
  };

  return (
    <>
      <ProductForm
        mode="add"
        formData={formData}
        seoData={seoData}
        errors={errors}
        touched={touched}
        submitAttempted={submitAttempted}
        brands={brands}
        imagePreview={imagePreview}
        imageURL={imageURL}
        useURL={useURL}
        imageProgress={imageProgress}
        showAddBrand={showAddBrand}
        onFieldChange={handleChange}
        onSeoChange={handleSeoChange}
        onCategoryToggle={handleCategoryToggle}
        onImageChange={handleImageChange}
        onImageURLChange={handleImageURLChange}
        onToggleUseURL={handleToggleUseURL}
        onBrandChange={handleChange}
        onShowAddBrand={() => setShowAddBrand(true)}
        onMarkTouched={markTouched}
        onSubmit={handleSubmit}
        loading={loading}
      />
      <BrandDialog
        open={showAddBrand}
        name={newBrandName}
        onNameChange={(e) => setNewBrandName(e.target.value)}
        logo={newBrandLogo}
        onLogoChange={(e) => {
          setNewBrandLogo(e.target.value);
          setBrandLogoFile(null);
        }}
        logoFile={brandLogoFile}
        onLogoFileChange={handleBrandLogoFileChange}
        description={newBrandDescription}
        onDescriptionChange={(e) => setNewBrandDescription(e.target.value)}
        submitting={uploadingBrandLogo}
        onSubmit={handleAddBrand}
        onClose={() => setShowAddBrand(false)}
        onCancel={() => {
          setShowAddBrand(false);
          setNewBrandName('');
          setNewBrandLogo('');
          setNewBrandDescription('');
          setBrandLogoFile(null);
        }}
      />
    </>
  );
};

export default AddProduct;
