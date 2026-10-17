import React, { useEffect, useMemo, useState } from 'react';
import { AD_CATEGORIES, DEFAULT_CATEGORY_ID, getCategoryById } from '../../data/adCategories';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../services/supabaseClient';
import { clearSubscriptionMetadataCache, normalizeExternalUrl } from '../../utils/subscriptionCatalog';

const BRAND_CATEGORY_ID = 'brand-advertisement';
const JOB_SEEKING_CATEGORY_ID = 'job-seeking';
const MAX_VIDEO_MB = 5;
const MAX_RESUME_MB = 10;

async function uploadAsset(file, prefix) {
    const fileExt = file.name.split('.').pop();
    const fileName = `${prefix}/${Math.random().toString(36).slice(2)}-${Date.now()}.${fileExt}`;

    const { error: uploadError } = await supabase.storage
        .from('ads')
        .upload(fileName, file);

    if (uploadError) {
        throw new Error(uploadError.message);
    }

    const { data: { publicUrl } } = supabase.storage
        .from('ads')
        .getPublicUrl(fileName);

    return publicUrl;
}

export default function PublishBillboardModal({ onClose, onPublished }) {
    const { user } = useAuth();
    const [categoryId, setCategoryId] = useState(DEFAULT_CATEGORY_ID);
    const [formValues, setFormValues] = useState({
        title: '',
        description: '',
        url: '',
        contact: '',
        email: '',
        phone: '',
        portfolioUrl: '',
    });
    const [selectedImage, setSelectedImage] = useState(null);
    const [imagePreviewUrl, setImagePreviewUrl] = useState(null);
    const [selectedVideo, setSelectedVideo] = useState(null);
    const [videoPreviewUrl, setVideoPreviewUrl] = useState(null);
    const [selectedResume, setSelectedResume] = useState(null);
    const [publishing, setPublishing] = useState(false);

    const category = getCategoryById(categoryId);
    const supportsVideo = categoryId === BRAND_CATEGORY_ID;
    const supportsResume = categoryId === JOB_SEEKING_CATEGORY_ID;
    const supportsDescription = categoryId !== BRAND_CATEGORY_ID;
    const supportsContact = categoryId === BRAND_CATEGORY_ID;
    const supportsEmail = categoryId !== BRAND_CATEGORY_ID;
    const supportsPhone = categoryId !== BRAND_CATEGORY_ID;
    const supportsUrl = ['brand-advertisement', 'job-hiring', 'services', 'others'].includes(categoryId);
    const supportsPortfolio = ['job-seeking', 'freelance'].includes(categoryId);

    useEffect(() => {
        return () => {
            if (imagePreviewUrl) {
                URL.revokeObjectURL(imagePreviewUrl);
            }
            if (videoPreviewUrl) {
                URL.revokeObjectURL(videoPreviewUrl);
            }
        };
    }, [imagePreviewUrl, videoPreviewUrl]);

    useEffect(() => {
        if (!supportsVideo && videoPreviewUrl) {
            URL.revokeObjectURL(videoPreviewUrl);
            setVideoPreviewUrl(null);
            setSelectedVideo(null);
        }

        if (!supportsResume) {
            setSelectedResume(null);
        }
    }, [supportsResume, supportsVideo, videoPreviewUrl]);

    const primaryUrl = useMemo(() => {
        if (supportsPortfolio) {
            return normalizeExternalUrl(formValues.portfolioUrl);
        }

        if (supportsUrl) {
            return normalizeExternalUrl(formValues.url);
        }

        return '';
    }, [formValues.portfolioUrl, formValues.url, supportsPortfolio, supportsUrl]);

    const handleValueChange = (field) => (event) => {
        setFormValues((current) => ({
            ...current,
            [field]: event.target.value,
        }));
    };

    const handleImageChange = (event) => {
        const file = event.target.files[0];
        if (!file) return;

        if (!(file.type === 'image/jpeg' || file.type === 'image/png')) {
            alert('Please select a valid JPG or PNG image.');
            event.target.value = null;
            return;
        }

        if (imagePreviewUrl) {
            URL.revokeObjectURL(imagePreviewUrl);
        }

        setSelectedImage(file);
        setImagePreviewUrl(URL.createObjectURL(file));
    };

    const handleVideoChange = (event) => {
        const file = event.target.files[0];
        if (!file) return;

        if (!file.type.startsWith('video/')) {
            alert('Please select a valid video file.');
            event.target.value = null;
            return;
        }

        if (file.size > MAX_VIDEO_MB * 1024 * 1024) {
            alert(`Video must be smaller than ${MAX_VIDEO_MB} MB.`);
            event.target.value = null;
            return;
        }

        if (videoPreviewUrl) {
            URL.revokeObjectURL(videoPreviewUrl);
        }

        setSelectedVideo(file);
        setVideoPreviewUrl(URL.createObjectURL(file));
    };

    const handleResumeChange = (event) => {
        const file = event.target.files[0];
        if (!file) return;

        const validTypes = [
            'application/pdf',
            'application/msword',
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        ];

        if (!validTypes.includes(file.type)) {
            alert('Please upload a PDF, DOC, or DOCX resume.');
            event.target.value = null;
            return;
        }

        if (file.size > MAX_RESUME_MB * 1024 * 1024) {
            alert(`Resume must be smaller than ${MAX_RESUME_MB} MB.`);
            event.target.value = null;
            return;
        }

        setSelectedResume(file);
    };

    const clearVideo = () => {
        if (videoPreviewUrl) {
            URL.revokeObjectURL(videoPreviewUrl);
        }
        setSelectedVideo(null);
        setVideoPreviewUrl(null);
    };

    const clearResume = () => {
        setSelectedResume(null);
    };

    const handleSubmit = async (event) => {
        event.preventDefault();

        if (!user) {
            alert('You must be logged in to publish a billboard.');
            return;
        }

        if (!selectedImage) {
            alert('Please select a photo for your billboard.');
            return;
        }

        setPublishing(true);

        try {
            const imageUrl = await uploadAsset(selectedImage, 'images');
            const videoUrl = supportsVideo && selectedVideo
                ? await uploadAsset(selectedVideo, 'videos')
                : '';
            const resumeUrl = supportsResume && selectedResume
                ? await uploadAsset(selectedResume, 'resumes')
                : '';

            const colors = ['#f6ad55', '#fc8181'];
            const selectedColor = colors[Math.floor(Math.random() * colors.length)];

            const { data: insertedSubscription, error: insertError } = await supabase
                .from('subscriptions')
                .insert([{
                    owner_id: user.id,
                    name: formValues.title.trim(),
                    image_url: imageUrl,
                    video_url: videoUrl || null,
                    url: primaryUrl || null,
                    color: selectedColor,
                }])
                .select()
                .single();

            if (insertError) {
                throw new Error(insertError.message);
            }

            const metadata = {
                category: category.id,
                title: formValues.title.trim(),
                description: supportsDescription ? formValues.description.trim() : '',
                url: supportsUrl ? normalizeExternalUrl(formValues.url) : '',
                contact: supportsContact ? formValues.contact.trim() : '',
                email: supportsEmail ? formValues.email.trim() : '',
                phone: supportsPhone ? formValues.phone.trim() : '',
                portfolioUrl: supportsPortfolio ? normalizeExternalUrl(formValues.portfolioUrl) : '',
                resumeUrl,
                imageUrl,
                videoUrl,
                createdAt: insertedSubscription.created_at,
            };

            const metadataBlob = new Blob([JSON.stringify(metadata, null, 2)], {
                type: 'application/json',
            });

            const { error: metadataUploadError } = await supabase.storage
                .from('ads')
                .upload(`metadata/${insertedSubscription.id}.json`, metadataBlob, {
                    contentType: 'application/json',
                    upsert: true,
                });

            if (metadataUploadError) {
                await supabase.from('subscriptions').delete().eq('id', insertedSubscription.id);
                throw new Error(`Metadata upload failed: ${metadataUploadError.message}`);
            }

            clearSubscriptionMetadataCache(insertedSubscription.id);
            window.dispatchEvent(new Event('adPublished'));

            if (onPublished) {
                onPublished(insertedSubscription);
            }

            alert(`${category.label} published successfully!`);
            onClose();
        } catch (error) {
            alert(`Failed to publish billboard.\n${error.message}`);
        } finally {
            setPublishing(false);
        }
    };

    return (
        <div className="modal">
            <div className="modal-content publish-modal-content modal-fixed-corners">
                <div className="modal-scroll-area">
                    <h2>Publish Billboard</h2>
                    <p>Choose a category and the upload form will adapt to the details that category needs.</p>

                    <form onSubmit={handleSubmit}>
                        <div className="input-group">
                            <label htmlFor="billboard-category">Category</label>
                            <select
                                id="billboard-category"
                                value={categoryId}
                                onChange={(event) => setCategoryId(event.target.value)}
                            >
                                {AD_CATEGORIES.map((item) => (
                                    <option key={item.id} value={item.id}>
                                        {item.label}
                                    </option>
                                ))}
                            </select>
                            <p className="field-hint">{category.description}</p>
                        </div>

                        <div className="input-group">
                            <label htmlFor="billboard-title">Title</label>
                            <input
                                id="billboard-title"
                                type="text"
                                value={formValues.title}
                                onChange={handleValueChange('title')}
                                required
                                placeholder="Enter a clear title"
                            />
                        </div>

                        <div className="input-group">
                            <label>Photo (JPG/PNG)</label>
                            <div className="file-upload-container">
                                <input
                                    type="file"
                                    accept="image/jpeg, image/png"
                                    onChange={handleImageChange}
                                    required
                                    id="billboard-image-upload"
                                    className="hidden-file-input"
                                />
                                <label htmlFor="billboard-image-upload" className="file-upload-label">
                                    {selectedImage ? 'Change Photo' : 'Select Photo'}
                                </label>
                                {imagePreviewUrl && (
                                    <div className="image-preview-wrapper">
                                        <img src={imagePreviewUrl} alt="Preview" className="ad-image-preview" />
                                    </div>
                                )}
                            </div>
                        </div>

                        {supportsDescription && (
                            <div className="input-group">
                                <label htmlFor="billboard-description">Description</label>
                                <textarea
                                    id="billboard-description"
                                    value={formValues.description}
                                    onChange={handleValueChange('description')}
                                    required
                                    rows={4}
                                    placeholder="Add the key details people should know"
                                />
                            </div>
                        )}

                        {supportsVideo && (
                            <div className="input-group">
                                <label>Video <span className="optional-tag">(Optional - max 5 MB)</span></label>
                                <div className="file-upload-container video-upload-container">
                                    <input
                                        type="file"
                                        accept="video/*"
                                        onChange={handleVideoChange}
                                        id="billboard-video-upload"
                                        className="hidden-file-input"
                                    />
                                    {!selectedVideo ? (
                                        <label htmlFor="billboard-video-upload" className="file-upload-label">
                                            Select Video
                                        </label>
                                    ) : (
                                        <>
                                            <video
                                                src={videoPreviewUrl}
                                                className="video-preview"
                                                controls
                                                muted
                                            />
                                            <div className="video-actions">
                                                <label htmlFor="billboard-video-upload" className="file-upload-label">
                                                    Change Video
                                                </label>
                                                <button type="button" className="remove-video-btn" onClick={clearVideo}>
                                                    Remove
                                                </button>
                                            </div>
                                        </>
                                    )}
                                    <p className="upload-hint">Videos are optional and will only be attached to brand advertisements.</p>
                                </div>
                            </div>
                        )}

                        {supportsResume && (
                            <div className="input-group">
                                <label>Resume <span className="optional-tag">(Optional - PDF/DOC/DOCX)</span></label>
                                <div className="file-upload-container resume-upload-container">
                                    <input
                                        type="file"
                                        accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                                        onChange={handleResumeChange}
                                        id="billboard-resume-upload"
                                        className="hidden-file-input"
                                    />
                                    <label htmlFor="billboard-resume-upload" className="file-upload-label">
                                        {selectedResume ? 'Change Resume' : 'Upload Resume'}
                                    </label>
                                    {selectedResume && (
                                        <div className="resume-file-pill">
                                            <span>{selectedResume.name}</span>
                                            <button type="button" className="resume-clear-btn" onClick={clearResume}>
                                                Remove
                                            </button>
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}

                        {supportsUrl && (
                            <div className="input-group">
                                <label htmlFor="billboard-url">URL <span className="optional-tag">(Optional)</span></label>
                                <input
                                    id="billboard-url"
                                    type="text"
                                    value={formValues.url}
                                    onChange={handleValueChange('url')}
                                    placeholder="example.com"
                                />
                            </div>
                        )}

                        {supportsPortfolio && (
                            <div className="input-group">
                                <label htmlFor="billboard-portfolio">Portfolio URL <span className="optional-tag">(Optional)</span></label>
                                <input
                                    id="billboard-portfolio"
                                    type="text"
                                    value={formValues.portfolioUrl}
                                    onChange={handleValueChange('portfolioUrl')}
                                    placeholder="portfolio.example.com"
                                />
                            </div>
                        )}

                        {supportsContact && (
                            <div className="input-group">
                                <label htmlFor="billboard-contact">Contact <span className="optional-tag">(Optional)</span></label>
                                <input
                                    id="billboard-contact"
                                    type="text"
                                    value={formValues.contact}
                                    onChange={handleValueChange('contact')}
                                    placeholder="Phone, email, or social handle"
                                />
                            </div>
                        )}

                        {supportsEmail && (
                            <div className="input-group">
                                <label htmlFor="billboard-email">Email</label>
                                <input
                                    id="billboard-email"
                                    type="email"
                                    value={formValues.email}
                                    onChange={handleValueChange('email')}
                                    required
                                    placeholder="name@example.com"
                                />
                            </div>
                        )}

                        {supportsPhone && (
                            <div className="input-group">
                                <label htmlFor="billboard-phone">Phone No <span className="optional-tag">(Optional)</span></label>
                                <input
                                    id="billboard-phone"
                                    type="text"
                                    value={formValues.phone}
                                    onChange={handleValueChange('phone')}
                                    placeholder="+91 98765 43210"
                                />
                            </div>
                        )}

                        <button type="submit" disabled={publishing} className="full-width-btn publish-btn">
                            {publishing ? 'Publishing...' : `Publish ${category.label}`}
                        </button>
                    </form>
                </div>

                <button className="close-btn" onClick={onClose}>&times;</button>
            </div>
        </div>
    );
}
