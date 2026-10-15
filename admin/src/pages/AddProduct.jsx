import { useState, useEffect } from 'react';
import { collection, addDoc, updateDoc, doc } from 'firebase/firestore';
import { db } from '../firebase';
import { cachedGetDocs, invalidateCache } from '../lib/firestoreCache';
import { brandSlugify, ensureUniqueBrandSlug, findDuplicateBrand, normalizeBrandName } from '../lib/brands';
import { uploadImage } from '../utils/uploadImage';
import { useNavigate } from 'react-router-dom';
import toast from '../utils/toast';
import BrandDialog from '../components/admin/BrandDialog';
import ProductForm from '../components/admin/ProductForm';
import { saveTradePricing, stripTradeFields } from '../lib/tradePricing';
import { slugify, ensureUniqueSlug } from '../lib/productLinks';
import { toggleCategoryValue } from '../config/categories';

const AddProduct = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [imageFile, setImageFile] = useState(null);
  const [imagePreview, setImagePreview] = useState('');
  const [imageURL, setImageURL] = useState('');
  const [useURL, setUseURL] = useState(false);
  const [imageProgress, setImageProgress] = useState(null);
  const [imageFile2, setImageFile2] = useState(null);
  const [imagePreview2, setImagePreview2] = useState('');
  const [imageURL2, setImageURL2] = useState('');
  const [useURL2, setUseURL2] = useState(false);
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
    brandId: '',
    brand: '',
    highlightBrand: '',
    highlightQuantity: '',
    highlightEffect: '',
    highlightIdealFor: '',
    highlightCod: true,
    highlightPremium: true,
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
      /* Shared cache with the Brands page — one download per minute. */
      const brandsList = await cachedGetDocs(collection(db, 'brands'), 'brands');
      setBrands(Array.isArray(brandsList) ? brandsList : []);
    } catch (error) {
      console.error('Error fetching brands:', error);
    }
  };

  /* Managed brand pick: the stable id is the source of truth, the name rides
     along as denormalized display text for legacy compatibility. */
  const handleBrandSelect = (brand) => {
    if (!brand) setFormData((prev) => ({ ...prev, brandId: '', brand: '' }));
    else setFormData((prev) => ({ ...prev, brandId: brand.id, brand: brand.name }));
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
    const name = normalizeBrandName(newBrandName);
    if (!name) {
      toast.error('Please enter a brand name');
      return;
    }
    if (findDuplicateBrand(brands, name)) {
      toast.error(`"${name}" already exists — pick it from the list instead`);
      return;
    }

    try {
      setUploadingBrandLogo(true);
      let logoURL = normalizeBrandName(newBrandLogo);

      if (brandLogoFile) {
        try {
          toast.loading('Uploading logo...', { id: 'brand-logo-upload' });
          logoURL = await uploadImage(brandLogoFile, {
            dir: 'brands',
            watermark: false,
          });
          toast.success('Logo uploaded', { id: 'brand-logo-upload' });
        } catch (uploadError) {
          toast.dismiss('brand-logo-upload');
          console.error('Logo upload failed:', uploadError);
          toast.error('Logo upload failed. Using URL instead if provided.');
          logoURL = newBrandLogo.startsWith('data:') ? '' : normalizeBrandName(newBrandLogo);
        }
      }

      const slug = await ensureUniqueBrandSlug(brandSlugify(name));
      const brandData = {
        name,
        slug,
        logo: logoURL,
        description: normalizeBrandName(newBrandDescription),
        active: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const docRef = await addDoc(collection(db, 'brands'), brandData);

      setBrands([...brands, { id: docRef.id, ...brandData }]);
      invalidateCache('coll:brands');
      setFormData({ ...formData, brandId: docRef.id, brand: name });
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

  const handleCategoryToggle = (entry) => {
    // Canonical toggle — stores the canonical value and collapses legacy
    // alias spellings, so the saved array always matches the shared config.
    setFormData(prev => ({
      ...prev,
      categories: toggleCategoryValue(prev.categories, entry)
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

  const handleImageChange2 = (e) => {
    const file = e.target.files[0];
    if (file) {
      setImageFile2(file);
      setImagePreview2((prev) => {
        if (prev && prev.startsWith('blob:')) URL.revokeObjectURL(prev);
        return URL.createObjectURL(file);
      });
    }
  };

  const handleImageURLChange2 = (e) => {
    setImageURL2(e.target.value);
    setImagePreview2(e.target.value);
  };

  const handleToggleUseURL2 = (val) => {
    if (typeof val === 'boolean') {
      setUseURL2(val);
    } else {
      setUseURL2(v => !v);
    }
    if (!val) {
      setImageFile2(null);
      setImagePreview2('');
    }
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
        toast.loading('Uploading image...', { id: 'product-img-upload' });
        setImageProgress(null);
        try {
          // Direct upload of the original file — no background removal,
          // no upscale, no watermark, no format conversion.
          finalImageURL = await uploadImage(imageFile, {
            dir: 'products',
            upscale: false,
            watermark: false,
          });
        } catch (uploadError) {
          toast.error(uploadError.message || 'Image upload failed', { id: 'product-img-upload' });
          setImageProgress(null);
          setLoading(false);
          return;
        }
        toast.success('Image uploaded', { id: 'product-img-upload' });
        setImageProgress(null);
      } else if (imageURL) {
        finalImageURL = imageURL;
      }

      // Optional second image — same existing /api/upload flow as primary.
      let finalImageURL2 = '';

      if (imageFile2) {
        toast.loading('Uploading second image...', { id: 'product-img2-upload' });
        try {
          finalImageURL2 = await uploadImage(imageFile2, {
            dir: 'products',
            upscale: false,
            watermark: false,
          });
        } catch (uploadError) {
          toast.error(uploadError.message || 'Second image upload failed', { id: 'product-img2-upload' });
          setLoading(false);
          return;
        }
        toast.success('Second image uploaded', { id: 'product-img2-upload' });
      } else if (imageURL2) {
        finalImageURL2 = imageURL2;
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
        imageURL2: finalImageURL2,
        isFeatured: formData.isFeatured,
        ...(formData.sortOrder !== '' ? { sortOrder: parseInt(formData.sortOrder, 10) } : {}),
        brandId: formData.brandId || null,
        brand: formData.brand || null,
        highlights: {
          brand: (formData.highlightBrand || '').trim(),
          quantity: (formData.highlightQuantity || '').trim(),
          effect: (formData.highlightEffect || '').trim(),
          idealFor: (formData.highlightIdealFor || '').trim(),
          codAvailable: formData.highlightCod !== false,
          premiumQuality: formData.highlightPremium !== false,
        },
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
        imagePreview2={imagePreview2}
        imageURL2={imageURL2}
        useURL2={useURL2}
        showAddBrand={showAddBrand}
        onFieldChange={handleChange}
        onSeoChange={handleSeoChange}
        onCategoryToggle={handleCategoryToggle}
        onImageChange={handleImageChange}
        onImageURLChange={handleImageURLChange}
        onToggleUseURL={handleToggleUseURL}
        onImageChange2={handleImageChange2}
        onImageURLChange2={handleImageURLChange2}
        onToggleUseURL2={handleToggleUseURL2}
        onBrandSelect={handleBrandSelect}
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

