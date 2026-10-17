import React, { useEffect, useMemo, useState } from 'react';
import { AD_CATEGORIES, getCategoryById } from '../../data/adCategories';
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

export default function EditAdModal({ ad, onClose, onSaved }) {
    const { user } = useAuth();
    
    // We lock the category to whatever the ad was originally published as
    const categoryId = ad.category;
    const category = getCategoryById(categoryId);
    
    const supportsVideo = categoryId === BRAND_CATEGORY_ID;
    const supportsResume = categoryId === JOB_SEEKING_CATEGORY_ID;
    const supportsDescription = categoryId !== BRAND_CATEGORY_ID;
    const supportsContact = categoryId === BRAND_CATEGORY_ID;
    const supportsEmail = categoryId !== BRAND_CATEGORY_ID;
    const supportsPhone = categoryId !== BRAND_CATEGORY_ID;
    const supportsUrl = ['brand-advertisement', 'job-hiring', 'services', 'others'].includes(categoryId);
    const supportsPortfolio = ['job-seeking', 'freelance'].includes(categoryId);

    const [formValues, setFormValues] = useState({
        title: ad.title || '',
        description: ad.description || '',
        url: ad.url || '',
        contact: ad.contact || '',
        email: ad.email || '',
        phone: ad.phone || '',
        portfolioUrl: ad.portfolioUrl || '',
    });

    const [selectedImage, setSelectedImage] = useState(null);
    const [imagePreviewUrl, setImagePreviewUrl] = useState(ad.imageUrl || null);
    
    const [selectedVideo, setSelectedVideo] = useState(null);
    const [videoPreviewUrl, setVideoPreviewUrl] = useState(ad.videoUrl || null);
    const [removeExistingVideo, setRemoveExistingVideo] = useState(false);
    
    const [selectedResume, setSelectedResume] = useState(null);
    const [existingResumeUrl, setExistingResumeUrl] = useState(ad.resumeUrl || null);
    const [removeExistingResume, setRemoveExistingResume] = useState(false);
    
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        return () => {
            if (imagePreviewUrl && selectedImage) {
                URL.revokeObjectURL(imagePreviewUrl);
            }
            if (videoPreviewUrl && selectedVideo) {
                URL.revokeObjectURL(videoPreviewUrl);
            }
        };
    }, [imagePreviewUrl, selectedImage, videoPreviewUrl, selectedVideo]);

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

        if (imagePreviewUrl && selectedImage) {
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

        if (videoPreviewUrl && selectedVideo) {
            URL.revokeObjectURL(videoPreviewUrl);
        }

        setSelectedVideo(file);
        setVideoPreviewUrl(URL.createObjectURL(file));
        setRemoveExistingVideo(false);
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
        setRemoveExistingResume(false);
    };

    const clearVideo = () => {
        if (videoPreviewUrl && selectedVideo) {
            URL.revokeObjectURL(videoPreviewUrl);
        }
        setSelectedVideo(null);
        setVideoPreviewUrl(null);
        setRemoveExistingVideo(true);
    };

    const clearResume = () => {
        setSelectedResume(null);
        setExistingResumeUrl(null);
        setRemoveExistingResume(true);
    };

    const handleSubmit = async (event) => {
        event.preventDefault();

        if (!user) {
            alert('You must be logged in to edit an ad.');
            return;
        }

        if (!imagePreviewUrl) {
            alert('Please select a photo for your billboard.');
            return;
        }

        setSaving(true);

        try {
            // Upload new assets if selected
            const finalImageUrl = selectedImage ? await uploadAsset(selectedImage, 'images') : ad.imageUrl;
            
            let finalVideoUrl = ad.videoUrl;
            if (removeExistingVideo) finalVideoUrl = '';
            if (selectedVideo) finalVideoUrl = await uploadAsset(selectedVideo, 'videos');
            
            let finalResumeUrl = ad.resumeUrl;
            if (removeExistingResume) finalResumeUrl = '';
            if (selectedResume) finalResumeUrl = await uploadAsset(selectedResume, 'resumes');

            // Update Postgres record
            const { error: updateError } = await supabase
                .from('subscriptions')
                .update({
                    name: formValues.title.trim(),
                    image_url: finalImageUrl,
                    video_url: finalVideoUrl || null,
                    url: primaryUrl || null,
                })
                .eq('id', ad.id);

            if (updateError) {
                throw new Error(updateError.message);
            }

            // Construct new metadata
            const metadata = {
                category: categoryId,
                title: formValues.title.trim(),
                description: supportsDescription ? formValues.description.trim() : '',
                url: supportsUrl ? normalizeExternalUrl(formValues.url) : '',
                contact: supportsContact ? formValues.contact.trim() : '',
                email: supportsEmail ? formValues.email.trim() : '',
                phone: supportsPhone ? formValues.phone.trim() : '',
                portfolioUrl: supportsPortfolio ? normalizeExternalUrl(formValues.portfolioUrl) : '',
                resumeUrl: finalResumeUrl,
                imageUrl: finalImageUrl,
                videoUrl: finalVideoUrl,
                createdAt: ad.metadata?.createdAt || ad.created_at, // Preserve original creation date
            };

            const metadataBlob = new Blob([JSON.stringify(metadata, null, 2)], {
                type: 'application/json',
            });

            // Overwrite metadata in storage
            const { error: metadataUploadError } = await supabase.storage
                .from('ads')
                .upload(`metadata/${ad.id}.json`, metadataBlob, {
                    contentType: 'application/json',
                    upsert: true,
                });

            if (metadataUploadError) {
                throw new Error(`Metadata upload failed: ${metadataUploadError.message}`);
            }

            // Invalidate cache and trigger UI update
            clearSubscriptionMetadataCache(ad.id);
            window.dispatchEvent(new Event('adPublished'));

            if (onSaved) {
                onSaved();
            }

            alert(`Ad updated successfully!`);
            onClose();
        } catch (error) {
            alert(`Failed to update ad.\n${error.message}`);
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="modal">
            <div className="modal-content publish-modal-content modal-fixed-corners">
                <div className="modal-scroll-area">
                    <h2>Edit Advertisement</h2>
                    <p>Modify your advertisement details below.</p>

                    <form onSubmit={handleSubmit}>
                        <div className="input-group">
                            <label htmlFor="billboard-category">Category</label>
                            <input
                                id="billboard-category"
                                type="text"
                                value={category.label}
                                disabled
                                style={{ backgroundColor: '#f1f5f9', cursor: 'not-allowed', color: '#64748b' }}
                            />
                            <p className="field-hint">Category cannot be changed after publishing.</p>
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
                                    id="billboard-image-upload"
                                    className="hidden-file-input"
                                />
                                <label htmlFor="billboard-image-upload" className="file-upload-label">
                                    Change Photo
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
                                    {!videoPreviewUrl ? (
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
                                        {(selectedResume || existingResumeUrl) ? 'Change Resume' : 'Upload Resume'}
                                    </label>
                                    {(selectedResume || existingResumeUrl) && (
                                        <div className="resume-file-pill">
                                            <span>{selectedResume ? selectedResume.name : 'Existing Resume (PDF)'}</span>
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

                        <button type="submit" disabled={saving} className="full-width-btn publish-btn">
                            {saving ? 'Saving...' : 'Save Changes'}
                        </button>
                    </form>
                </div>

                <button className="close-btn" onClick={onClose}>&times;</button>
            </div>
        </div>
    );
}
