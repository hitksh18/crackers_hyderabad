import { useState, useEffect, useCallback, useRef } from 'react';
import { doc, getDoc, updateDoc, collection, addDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { cachedGetDocs, invalidateCache } from '../lib/firestoreCache';
import { brandSlugify, ensureUniqueBrandSlug, findDuplicateBrand, normalizeBrandName } from '../lib/brands';
import { uploadImage } from '../utils/uploadImage';
import { useNavigate, useParams } from 'react-router-dom';
import toast from '../utils/toast';
import BrandDialog from '../components/admin/BrandDialog';
import ProductForm from '../components/admin/ProductForm';
import {
  fetchTradePricing,
  saveTradePricing,
  stripTradeFields,
  TRADE_FIELD_DELETIONS,
} from '../lib/tradePricing';
import { slugify, ensureUniqueSlug } from '../lib/productLinks';
import { toggleCategoryValue } from '../config/categories';

const EditProduct = () => {
  const { id } = useParams();
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
  const pricingLoadFailed = useRef(false);
  const currentSlugRef = useRef(null);
  const currentOldSlugsRef = useRef([]);
  const [formData, setFormData] = useState({
    name: '',
    categories: [],
    onlinePrice: '',
    discountPrice: '',
    offlineMRP: '',
    offlineDiscountPrice: '',
    offlinePrice: '',
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

  const fetchBrands = useCallback(async () => {
    try {
      /* Shared cache with the Brands page — one download per minute. */
      const brandsList = await cachedGetDocs(collection(db, 'brands'), 'brands');
      const list = Array.isArray(brandsList) ? brandsList : [];
      setBrands(list);
      return list;
    } catch (error) {
      console.error('Error fetching brands:', error);
      return [];
    }
  }, []);

  const fetchProduct = useCallback(async (brandsList = []) => {
    try {
      const docRef = doc(db, 'products', id);
      const [docSnap, pricing] = await Promise.all([
        getDoc(docRef),
        fetchTradePricing(id).catch((pricingError) => {
          console.error('Error fetching trade pricing:', pricingError);
          toast.error('Could not load the store prices for this product');
          pricingLoadFailed.current = true;
          return null;
        }),
      ]);
      if (docSnap.exists()) {
        const data = { ...docSnap.data(), ...(pricing || {}) };
        currentSlugRef.current = data.slug || null;
        currentOldSlugsRef.current = Array.isArray(data.oldSlugs)
          ? data.oldSlugs.filter((s) => typeof s === 'string')
          : [];
        /* Brand resolution: stable id first; a legacy brand string that
           matches a managed record adopts that record; unmatched text is
           preserved as-is so nothing the shop already shows is lost. */
        const matchByName = (raw) => (Array.isArray(brandsList) ? brandsList : []).find(
          (b) => normalizeBrandName(b.name).toLowerCase() === normalizeBrandName(raw).toLowerCase(),
        );
        const rawId = (typeof data.brandId === 'string' && data.brandId)
          || (data.brand && typeof data.brand === 'object' && data.brand.id) || '';
        const rawName = typeof data.brand === 'string' ? data.brand : (data.brand?.name || '');
        let brandId = '';
        let brandName = normalizeBrandName(rawName);
        const idMatch = rawId ? (brandsList || []).find((b) => String(b.id) === String(rawId)) : null;
        if (idMatch) {
          brandId = idMatch.id;
          brandName = normalizeBrandName(idMatch.name);
        } else if (brandName) {
          const nameMatch = matchByName(brandName);
          if (nameMatch) {
            brandId = nameMatch.id;
            brandName = normalizeBrandName(nameMatch.name);
          }
        }
        setFormData({
          name: data.name || '',
          categories: data.categories || (data.category ? [data.category] : []),
          onlinePrice: data.onlinePrice || data.price || '',
          discountPrice: data.discountPrice || '',
          offlineMRP: data.offlineMRP || data.offlinePrice || data.price || '',
          offlineDiscountPrice: data.offlineDiscountPrice || '',
          offlinePrice: data.offlinePrice || '',
          outOfStock: data.outOfStock || false,
          description: data.description || '',
          isFeatured: data.isFeatured || false,
          sortOrder: data.sortOrder != null ? String(data.sortOrder) : '',
          brandId,
          brand: brandName,
          highlightBrand: data.highlights?.brand || '',
          highlightQuantity: data.highlights?.quantity || '',
          highlightEffect: data.highlights?.effect || '',
          highlightIdealFor: data.highlights?.idealFor || '',
          highlightCod: data.highlights?.codAvailable !== false,
          highlightPremium: data.highlights?.premiumQuality !== false,
        });
        setImagePreview(data.imageURL || '');
        setImageURL(data.imageURL || '');
        setImagePreview2(data.imageURL2 || '');
        setImageURL2(data.imageURL2 || '');

        if (data.seo) {
          setSeoData({
            title: data.seo.title || '',
            description: data.seo.description || '',
            keywords: Array.isArray(data.seo.keywords) ? data.seo.keywords.join(', ') : '',
            slug: data.seo.slug || '',
            tags: Array.isArray(data.seo.tags) ? data.seo.tags.join(', ') : '',
          });
        }
      }
    } catch (error) {
      console.error('Error fetching product:', error);
      toast.error('Failed to load product');
    }
  }, [id]);

  useEffect(() => {
    /* Brands first — product brand resolution needs the managed records. */
    (async () => {
      const list = await fetchBrands();
      await fetchProduct(list);
    })();
  }, [fetchProduct, fetchBrands]);

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

  /* Managed brand pick: the stable id is the source of truth, the name rides
     along as denormalized display text for legacy compatibility. */
  const handleBrandSelect = (brand) => {
    if (!brand) setFormData((prev) => ({ ...prev, brandId: '', brand: '' }));
    else setFormData((prev) => ({ ...prev, brandId: brand.id, brand: brand.name }));
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
      setImageURL('');
      setUseURL(false);
    }
  };

  const handleImageURLChange = (e) => {
    setImageURL(e.target.value);
    setImagePreview(e.target.value);
    if (e.target.value) setImageFile(null);
  };

  const handleToggleUseURL = (val) => {
    if (typeof val === 'boolean') setUseURL(val);
    else setUseURL(v => !v);
  };

  const handleImageChange2 = (e) => {
    const file = e.target.files[0];
    if (file) {
      setImageFile2(file);
      setImagePreview2((prev) => {
        if (prev && prev.startsWith('blob:')) URL.revokeObjectURL(prev);
        return URL.createObjectURL(file);
      });
      setImageURL2('');
      setUseURL2(false);
    }
  };

  const handleImageURLChange2 = (e) => {
    setImageURL2(e.target.value);
    setImagePreview2(e.target.value);
    if (e.target.value) setImageFile2(null);
  };

  const handleToggleUseURL2 = (val) => {
    if (typeof val === 'boolean') setUseURL2(val);
    else setUseURL2(v => !v);
  };

  const markTouched = (e) => {
    const key = e.target.name;
    if (!key) return;
    setTouched(prev => (prev[key] ? prev : { ...prev, [key]: true }));
  };

  const handleSubmit = async (e) => {
    if (e) e.preventDefault();
    setSubmitAttempted(true);
    setLoading(true);

    try {
      let imageURLFinal = imagePreview;

      if (imageFile) {
        toast.loading('Uploading image...', { id: 'product-img-upload' });
        setImageProgress(null);
        try {
          // Direct upload of the original file — no background removal,
          // no upscale, no watermark, no format conversion.
          imageURLFinal = await uploadImage(imageFile, {
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
        imageURLFinal = imageURL;
      }

      // Optional second image — same existing /api/upload flow as primary.
      // Untouched when the admin picks nothing new: the stored value stays.
      let imageURL2Final = imagePreview2;

      if (imageFile2) {
        toast.loading('Uploading second image...', { id: 'product-img2-upload' });
        try {
          imageURL2Final = await uploadImage(imageFile2, {
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
        imageURL2Final = imageURL2;
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
        slug = await ensureUniqueSlug(seoObject.slug || formData.name, id);
      } catch {
        slug = slugify(seoObject.slug || formData.name);
      }
      seoObject.slug = slug;

      const retiredSlug = currentSlugRef.current;
      const oldSlugs = [
        ...currentOldSlugsRef.current.filter((s) => s && s !== slug),
        ...(retiredSlug && retiredSlug !== slug ? [retiredSlug] : []),
      ].slice(-25);

      const productData = {
        name: formData.name,
        categories: formData.categories,
        category: formData.categories[0] || '',
        onlinePrice: parseFloat(formData.onlinePrice),
        discountPrice: formData.discountPrice ? parseFloat(formData.discountPrice) : null,
        outOfStock: formData.outOfStock,
        description: formData.description,
        imageURL: imageURLFinal,
        imageURL2: imageURL2Final,
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
        oldSlugs,
        updatedAt: new Date(),
      };

      await updateDoc(doc(db, 'products', id), {
        ...stripTradeFields(productData),
        ...TRADE_FIELD_DELETIONS,
      });

      if (pricingLoadFailed.current) {
        toast.error(
          'Product updated. Store prices were NOT saved because they could not be loaded — reload the page before editing them.',
          { duration: 8000 }
        );
        navigate('/products');
        return;
      }

      try {
        await saveTradePricing(id, formData);
      } catch (pricingError) {
        console.error('Error saving trade pricing:', pricingError);
        toast.error('Product updated, but the store prices did not save — try saving again.');
        return;
      }

      toast.success('Product updated successfully!');
      navigate('/products');
    } catch (error) {
      console.error('Error updating product:', error);
      toast.error('Failed to update product');
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
        mode="edit"
        productName={formData.name}
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

export default EditProduct;

