// State to track if modal was opened from start creating button
let isCreatingAfterProfileSetup = false;

// API configuration
// API configuration - use relative path for deployment compatibility
const API_BASE_URL = '/api';

// DOM elements
const storyGrid = document.getElementById('storyGrid');
const startCreatingBtn = document.getElementById('startCreatingBtn');
const editProfileBtn = document.getElementById('editProfileBtn');

// Hidden input fields (used for data storage only)
const childName = document.getElementById('childName');
const childAge = document.getElementById('childAge');
const genderMale = document.getElementById('genderMale');
const genderFemale = document.getElementById('genderFemale');

// Display elements (read-only display)
const displayChildName = document.getElementById('displayChildName');
const displayChildAge = document.getElementById('displayChildAge');
const displayChildGender = document.getElementById('displayChildGender');

// Modal elements
const profileModal = document.getElementById('profileModal');
const modalClose = document.querySelector('.modal-close');
const modalChildName = document.getElementById('modalChildName');
const modalChildAge = document.getElementById('modalChildAge');
const modalGenderMale = document.getElementById('modalGenderMale');
const modalGenderFemale = document.getElementById('modalGenderFemale');
const modalSaveBtn = document.getElementById('modalSaveBtn');
const modalCancelBtn = document.getElementById('modalCancelBtn');

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    loadProfile();
    loadStories();
    setupEventListeners();
});

// Setup event listeners
function setupEventListeners() {
    startCreatingBtn.addEventListener('click', startCreating);
    editProfileBtn.addEventListener('click', openProfileModal);
    
    // Modal controls
    modalClose.addEventListener('click', closeProfileModal);
    modalCancelBtn.addEventListener('click', closeProfileModal);
    modalSaveBtn.addEventListener('click', saveProfileFromModal);
    
    // Close modal when clicking outside
    profileModal.addEventListener('click', (e) => {
        if (e.target === profileModal) {
            closeProfileModal();
        }
    });
}

// Load profile from localStorage
function loadProfile() {
    const savedProfile = localStorage.getItem('childProfile');
    if (savedProfile) {
        const profile = JSON.parse(savedProfile);
        childName.value = profile.name || '';
        childAge.value = profile.age || '';
        if (profile.gender === 'male') {
            genderMale.checked = true;
        } else if (profile.gender === 'female') {
            genderFemale.checked = true;
        }
        updateProfileDisplay(profile);
    }
}

// Save profile to localStorage
function saveProfile(profile) {
    localStorage.setItem('childProfile', JSON.stringify(profile));
}

// Get child profile
function getChildProfile() {
    return {
        name: childName.value.trim() || '',
        age: childAge.value ? parseInt(childAge.value) : null,
        gender: genderMale.checked ? 'male' : genderFemale.checked ? 'female' : null
    };
}

// Update profile display
function updateProfileDisplay(profile) {
    displayChildName.textContent = profile.name || '未设置';
    displayChildAge.textContent = profile.age ? `${profile.age}岁` : '未设置';
    
    if (profile.gender === 'male') {
        displayChildGender.textContent = '👦 男孩';
    } else if (profile.gender === 'female') {
        displayChildGender.textContent = '👧 女孩';
    } else {
        displayChildGender.textContent = '未设置';
    }
}

// Open profile configuration modal
function openProfileModal() {
    const profile = getChildProfile();
    modalChildName.value = profile.name || '';
    modalChildAge.value = profile.age || '';
    
    if (profile.gender === 'male') {
        modalGenderMale.checked = true;
    } else if (profile.gender === 'female') {
        modalGenderFemale.checked = true;
    } else {
        modalGenderMale.checked = false;
        modalGenderFemale.checked = false;
    }
    
    profileModal.style.display = 'flex';
}

// Close profile configuration modal
function closeProfileModal() {
    profileModal.style.display = 'none';
    // Reset flag when modal is closed
    isCreatingAfterProfileSetup = false;
}

// Save profile from modal
async function saveProfileFromModal() {
    const name = modalChildName.value.trim();
    const age = modalChildAge.value ? parseInt(modalChildAge.value) : null;
    const gender = modalGenderMale.checked ? 'male' : modalGenderFemale.checked ? 'female' : null;
    
    // Validate
    if (!name) {
        showError('请输入姓名');
        return;
    }
    if (!age || age < 3 || age > 15) {
        showError('请输入有效的年龄（3-15岁）');
        return;
    }
    if (!gender) {
        showError('请选择性别');
        return;
    }
    
    const profile = { name, age, gender };
    
    // Update hidden input fields
    childName.value = name;
    childAge.value = age;
    if (gender === 'male') {
        genderMale.checked = true;
    } else {
        genderFemale.checked = true;
    }
    
    // Update display
    updateProfileDisplay(profile);
    
    // Save to localStorage
    saveProfile(profile);
    
    // Close modal
    closeProfileModal();
    
    // If modal was opened from "开始创作" button, navigate to story page
    if (isCreatingAfterProfileSetup) {
        isCreatingAfterProfileSetup = false;
        await createStoryAndNavigate(profile);
    }
}

// Start creating story
async function startCreating() {
    const profile = getChildProfile();
    
    // Check if profile is configured
    if (!profile.name || !profile.age || !profile.gender) {
        // Mark that we're creating after profile setup
        isCreatingAfterProfileSetup = true;
        // Show modal instead of alert
        openProfileModal();
        return;
    }
    
    // Profile is configured, create story immediately
    await createStoryAndNavigate(profile);
}

// Create story and navigate to story page
async function createStoryAndNavigate(profile) {
    try {
        // Create new story
        const response = await fetch(`${API_BASE_URL}/stories`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ childProfile: profile })
        });
        
        if (!response.ok) {
            throw new Error('Failed to create story');
        }
        
        const data = await response.json();
        
        // Navigate to story page with storyId
        window.location.href = `story.html?storyId=${data.storyId}`;
        
    } catch (error) {
        console.error('Failed to start creating:', error);
        showError('创建故事失败，请重试');
    }
}

// Load stories
async function loadStories() {
    try {
        const response = await fetch(`${API_BASE_URL}/stories`);
        const data = await response.json();
        
        console.log('Loaded stories:', data.stories);
        
        storyGrid.innerHTML = '';
        
        if (data.stories.length === 0) {
            storyGrid.innerHTML = '<div class="no-stories">还没有创作故事哦，快开始第一个故事吧！</div>';
            return;
        }
        
        data.stories.reverse().forEach(story => {
            const storyCard = document.createElement('div');
            storyCard.className = 'story-card';
            
            const preview = story.messages && story.messages.length > 0 
                ? story.messages[0].content.substring(0, 50) + '...'
                : '新故事';
            
            const date = new Date(story.createdAt).toLocaleDateString('zh-CN');
            
            // Get author info
            const authorName = story.childProfile && story.childProfile.name ? story.childProfile.name : '小作者';
            const authorAge = story.childProfile && story.childProfile.age ? `${story.childProfile.age}岁` : '';
            const authorGender = story.childProfile && story.childProfile.gender 
                ? (story.childProfile.gender === 'male' ? '👦' : '👧') 
                : '👶';
            
            storyCard.innerHTML = `
                <div class="story-card-header">
                    <span class="story-date">📅 ${date}</span>
                    <button class="delete-story" data-id="${story.id}" title="删除">×</button>
                </div>
                <div class="story-card-body">
                    <p class="story-preview">${preview}</p>
                    <div class="story-card-footer">
                        <div class="story-meta">
                            <span class="author-info">
                                ${authorGender} ${authorName}${authorAge ? ' · ' + authorAge : ''}
                            </span>
                            <span class="message-count">💬 ${story.messages ? story.messages.length : 0} 条对话</span>
                        </div>
                    </div>
                </div>
            `;
            
            // Click to continue story
            storyCard.addEventListener('click', (e) => {
                if (!e.target.classList.contains('delete-story')) {
                    window.location.href = `story.html?storyId=${story.id}`;
                }
            });
            
            // Delete button
            const deleteBtn = storyCard.querySelector('.delete-story');
            deleteBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                deleteStory(story.id);
            });
            
            storyGrid.appendChild(storyCard);
        });
    } catch (error) {
        console.error('Failed to load stories:', error);
        showError('加载故事列表失败');
    }
}

// Delete story
async function deleteStory(storyId) {
    // Create custom confirmation dialog
    const confirmDelete = await showConfirmDialog('确定要删除这个故事吗？');
    if (!confirmDelete) {
        return;
    }
    
    try {
        await fetch(`${API_BASE_URL}/stories/${storyId}`, {
            method: 'DELETE'
        });
        loadStories();
    } catch (error) {
        console.error('Failed to delete story:', error);
        showError('删除故事失败');
    }
}

// Show confirmation dialog
function showConfirmDialog(message) {
    return new Promise((resolve) => {
        // Create overlay
        const overlay = document.createElement('div');
        overlay.className = 'confirm-overlay';
        
        // Create dialog
        const dialog = document.createElement('div');
        dialog.className = 'confirm-dialog';
        dialog.innerHTML = `
            <div class="confirm-header">提示</div>
            <div class="confirm-body">${message}</div>
            <div class="confirm-footer">
                <button class="confirm-cancel-btn">取消</button>
                <button class="confirm-ok-btn">确定</button>
            </div>
        `;
        
        overlay.appendChild(dialog);
        document.body.appendChild(overlay);
        
        // Show with animation
        setTimeout(() => {
            overlay.classList.add('show');
        }, 10);
        
        // Handle buttons
        const cancelBtn = dialog.querySelector('.confirm-cancel-btn');
        const okBtn = dialog.querySelector('.confirm-ok-btn');
        
        const cleanup = () => {
            overlay.classList.remove('show');
            setTimeout(() => {
                document.body.removeChild(overlay);
            }, 300);
        };
        
        cancelBtn.addEventListener('click', () => {
            cleanup();
            resolve(false);
        });
        
        okBtn.addEventListener('click', () => {
            cleanup();
            resolve(true);
        });
        
        // Click outside to cancel
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) {
                cleanup();
                resolve(false);
            }
        });
    });
}

// Show error message with custom toast notification
function showError(message) {
    // Create toast element
    const toast = document.createElement('div');
    toast.className = 'error-toast';
    toast.textContent = message;
    
    // Add to document
    document.body.appendChild(toast);
    
    // Trigger animation
    setTimeout(() => {
        toast.classList.add('show');
    }, 10);
    
    // Remove after 3 seconds
    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => {
            document.body.removeChild(toast);
        }, 300);
    }, 3000);
}
