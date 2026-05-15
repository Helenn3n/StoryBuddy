// API base URL
// API base URL - use relative path for deployment compatibility
const API_BASE_URL = '/api';

// State management
let currentStoryId = null;
let isWaitingForResponse = false;

// DOM elements
const storyMessages = document.getElementById('storyMessages');
const messageInput = document.getElementById('messageInput');
const sendBtn = document.getElementById('sendBtn');
const newStoryBtn = document.getElementById('newStoryBtn');
const storyList = document.getElementById('storyList');

// Hidden input fields (used for data storage only)
const childName = document.getElementById('childName');
const childAge = document.getElementById('childAge');
const genderMale = document.getElementById('genderMale');
const genderFemale = document.getElementById('genderFemale');

// Display elements (read-only display in sidebar)
const displayChildName = document.getElementById('displayChildName');
const displayChildAge = document.getElementById('displayChildAge');
const displayChildGender = document.getElementById('displayChildGender');

const saveProfileBtn = document.getElementById('saveProfileBtn');
const editProfileBtn = document.getElementById('editProfileBtn');

// Modal elements
const profileModal = document.getElementById('profileModal');
const modalClose = document.querySelector('.modal-close');
const modalChildName = document.getElementById('modalChildName');
const modalChildAge = document.getElementById('modalChildAge');
const modalGenderMale = document.getElementById('modalGenderMale');
const modalGenderFemale = document.getElementById('modalGenderFemale');
const modalSaveBtn = document.getElementById('modalSaveBtn');
const modalCancelBtn = document.getElementById('modalCancelBtn');

// Initialize app
document.addEventListener('DOMContentLoaded', () => {
    loadStories();
    setupEventListeners();
    createNewStory();
});

// Setup event listeners
function setupEventListeners() {
    // Send button click
    sendBtn.addEventListener('click', sendMessage);

    // Enter key to send (Shift+Enter for new line)
    messageInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendMessage();
        }
    });

    // Auto-resize textarea
    messageInput.addEventListener('input', () => {
        messageInput.style.height = 'auto';
        messageInput.style.height = Math.min(messageInput.scrollHeight, 200) + 'px';
    });

    // New story button
    newStoryBtn.addEventListener('click', createNewStory);

    // Save profile button (hidden by default)
    saveProfileBtn.addEventListener('click', saveProfile);

    // Edit profile button
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

    // Profile input changes (auto-save removed)
    // Profile changes now only save via modal
}

// Create new story
async function createNewStory() {
    try {
        const response = await fetch(`${API_BASE_URL}/stories`, {
            method: 'POST'
        });
        const data = await response.json();
        currentStoryId = data.storyId;
        
        // Clear story messages
        storyMessages.innerHTML = '';
        
        // Clear input
        messageInput.value = '';
        messageInput.style.height = 'auto';
        
        // Clear profile fields in sidebar (will be loaded if exists)
        childName.value = '';
        childAge.value = '';
        genderMale.checked = false;
        genderFemale.checked = false;
        
        // Clear display elements
        updateProfileDisplay({ name: '', age: null, gender: null });
        
        // Reload stories list
        loadStories();
        
        // Check if profile is configured, if not show modal
        await checkAndPromptProfile();
        
    } catch (error) {
        console.error('Failed to create story:', error);
        showError('创建新故事失败，请重试');
    }
}

// Check if profile is configured and prompt if not
async function checkAndPromptProfile() {
    const profile = getChildProfile();
    
    // Check if profile is complete
    if (!profile.name || !profile.age || !profile.gender) {
        // Show modal to configure profile
        openProfileModal();
    } else {
        // Profile exists, show AI greeting
        await showAIGreeting(profile);
    }
}

// Show AI greeting based on child profile
async function showAIGreeting(profile) {
    try {
        const response = await fetch(`${API_BASE_URL}/greeting`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                storyId: currentStoryId,
                childProfile: profile
            })
        });
        
        if (response.ok) {
            const data = await response.json();
            // Add greeting message to UI
            addMessageToUI('assistant', data.greeting);
        }
    } catch (error) {
        console.error('Failed to get greeting:', error);
        // Show default greeting if API fails
        const genderText = profile.gender === 'male' ? '男生' : '女生';
        const defaultGreeting = `你好，${profile.name}，作为一个${profile.age}岁的${genderText}，今天又有什么新奇的想法呢？快来和我一起将你的想法创作为一个故事吧！`;
        addMessageToUI('assistant', defaultGreeting);
    }
}

// Open profile configuration modal
function openProfileModal() {
    // Load current profile values into modal
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
    
    // Show modal
    profileModal.style.display = 'flex';
}

// Close profile configuration modal
function closeProfileModal() {
    profileModal.style.display = 'none';
}

// Save profile from modal
async function saveProfileFromModal() {
    const name = modalChildName.value.trim();
    const age = modalChildAge.value ? parseInt(modalChildAge.value) : null;
    const gender = modalGenderMale.checked ? 'male' : modalGenderFemale.checked ? 'female' : null;
    
    // Validate
    if (!name) {
        alert('请输入姓名');
        return;
    }
    if (!age || age < 3 || age > 15) {
        alert('请输入有效的年龄（3-15岁）');
        return;
    }
    if (!gender) {
        alert('请选择性别');
        return;
    }
    
    const profile = { name, age, gender };
    
    // Update hidden input fields (for data storage)
    childName.value = name;
    childAge.value = age;
    if (gender === 'male') {
        genderMale.checked = true;
    } else {
        genderFemale.checked = true;
    }
    
    // Update display elements (visible to user)
    updateProfileDisplay(profile);
    
    // Save to backend
    await saveProfile();
    
    // Close modal
    closeProfileModal();
    
    // Show AI greeting if this is a new story and welcome message is showing
    const welcomeMsg = storyMessages.querySelector('.welcome-message');
    if (welcomeMsg) {
        welcomeMsg.remove();
        await showAIGreeting(profile);
    }
}

// Update profile display in sidebar
function updateProfileDisplay(profile) {
    // Update name display
    displayChildName.textContent = profile.name || '未设置';
    
    // Update age display
    displayChildAge.textContent = profile.age ? `${profile.age}岁` : '未设置';
    
    // Update gender display
    if (profile.gender === 'male') {
        displayChildGender.textContent = '👦 男孩';
    } else if (profile.gender === 'female') {
        displayChildGender.textContent = '👧 女孩';
    } else {
        displayChildGender.textContent = '未设置';
    }
}

// Send message
async function sendMessage() {
    const message = messageInput.value.trim();
    
    if (!message || isWaitingForResponse) {
        return;
    }

    if (!currentStoryId) {
        await createNewStory();
    }

    // Get child profile
    const profile = getChildProfile();

    // Clear input and reset height
    messageInput.value = '';
    messageInput.style.height = 'auto';

    // Remove welcome message if exists
    const welcomeMsg = storyMessages.querySelector('.welcome-message');
    if (welcomeMsg) {
        welcomeMsg.remove();
    }

    // Add user message to UI
    addMessageToUI('user', message);

    // Show loading indicator
    const loadingId = addLoadingIndicator();

    // Disable input
    isWaitingForResponse = true;
    sendBtn.disabled = true;
    messageInput.disabled = true;

    try {
        const response = await fetch(`${API_BASE_URL}/chat`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                message: message,
                storyId: currentStoryId,
                childProfile: profile
            })
        });

        if (!response.ok) {
            throw new Error('Failed to send message');
        }

        const data = await response.json();

        // Remove loading indicator
        removeLoadingIndicator(loadingId);

        // Add assistant response to UI (with optional image)
        addMessageToUI('assistant', data.response, data.imageUrl);

        // Update stories list
        loadStories();

    } catch (error) {
        console.error('Story creation error:', error);
        removeLoadingIndicator(loadingId);
        showError('创作失败，请重试');
    } finally {
        // Re-enable input
        isWaitingForResponse = false;
        sendBtn.disabled = false;
        messageInput.disabled = false;
        messageInput.focus();
    }
}

// Get child profile
function getChildProfile() {
    return {
        name: childName.value.trim() || '',
        age: childAge.value ? parseInt(childAge.value) : null,
        gender: genderMale.checked ? 'male' : genderFemale.checked ? 'female' : null
    };
}

// Save profile
async function saveProfile() {
    if (!currentStoryId) return;

    const profile = getChildProfile();

    try {
        await fetch(`${API_BASE_URL}/profile/${currentStoryId}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(profile)
        });
    } catch (error) {
        console.error('Failed to save profile:', error);
    }
}

// Add message to UI
function addMessageToUI(role, content, imageUrl = null) {
    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${role}-message`;
    
    const avatar = document.createElement('div');
    avatar.className = 'message-avatar';
    
    // Set avatar based on role and gender
    if (role === 'user') {
        const profile = getChildProfile();
        if (profile.gender === 'male') {
            avatar.textContent = '👦'; // Boy
        } else if (profile.gender === 'female') {
            avatar.textContent = '👧'; // Girl
        } else {
            avatar.textContent = '👶'; // Default baby icon
        }
    } else {
        avatar.textContent = '🤖'; // AI robot
    }
    
    const contentWrapper = document.createElement('div');
    contentWrapper.className = 'message-content-wrapper';
    
    // Add image if exists
    if (imageUrl) {
        const imgDiv = document.createElement('div');
        imgDiv.className = 'message-image';
        const img = document.createElement('img');
        img.src = imageUrl;
        img.alt = 'Story illustration';
        img.onload = () => {
            storyMessages.scrollTop = storyMessages.scrollHeight;
        };
        imgDiv.appendChild(img);
        contentWrapper.appendChild(imgDiv);
    }
    
    // Add text content
    const contentDiv = document.createElement('div');
    contentDiv.className = 'message-content';
    contentDiv.textContent = content;
    contentWrapper.appendChild(contentDiv);
    
    messageDiv.appendChild(avatar);
    messageDiv.appendChild(contentWrapper);
    
    storyMessages.appendChild(messageDiv);
    
    // Scroll to bottom
    storyMessages.scrollTop = storyMessages.scrollHeight;
}

// Add loading indicator
function addLoadingIndicator() {
    const loadingId = 'loading-' + Date.now();
    const loadingDiv = document.createElement('div');
    loadingDiv.className = 'message assistant-message';
    loadingDiv.id = loadingId;
    
    const avatar = document.createElement('div');
    avatar.className = 'message-avatar';
    avatar.textContent = '🤖'; // AI robot - consistent with assistant messages
    
    const contentWrapper = document.createElement('div');
    contentWrapper.className = 'message-content-wrapper';
    
    const contentDiv = document.createElement('div');
    contentDiv.className = 'message-content loading';
    contentDiv.innerHTML = '<span class="loading-dots"><span>.</span><span>.</span><span>.</span></span>';
    
    contentWrapper.appendChild(contentDiv);
    loadingDiv.appendChild(avatar);
    loadingDiv.appendChild(contentWrapper);
    
    storyMessages.appendChild(loadingDiv);
    storyMessages.scrollTop = storyMessages.scrollHeight;
    
    return loadingId;
}

// Remove loading indicator
function removeLoadingIndicator(loadingId) {
    const loadingDiv = document.getElementById(loadingId);
    if (loadingDiv) {
        loadingDiv.remove();
    }
}

// Load stories
async function loadStories() {
    try {
        const response = await fetch(`${API_BASE_URL}/stories`);
        const data = await response.json();
        
        storyList.innerHTML = '';
        
        if (data.stories.length === 0) {
            storyList.innerHTML = '<div class="no-stories">还没有创作故事哦</div>';
            return;
        }
        
        data.stories.reverse().forEach(story => {
            const storyItem = document.createElement('div');
            storyItem.className = 'story-item';
            if (story.id === currentStoryId) {
                storyItem.classList.add('active');
            }
            
            storyItem.innerHTML = `
                <div class="story-icon">📖</div>
                <div class="story-info">
                    <div class="story-title">${story.title}</div>
                    <div class="story-meta">
                        <span>👤 ${story.childName}</span>
                        <span>💬 ${story.messageCount}</span>
                    </div>
                </div>
                <button class="delete-story" data-id="${story.id}" title="删除故事">×</button>
            `;
            
            storyItem.addEventListener('click', (e) => {
                if (!e.target.classList.contains('delete-story')) {
                    loadStory(story.id, e);
                }
            });
            
            const deleteBtn = storyItem.querySelector('.delete-story');
            deleteBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                deleteStory(story.id);
            });
            
            storyList.appendChild(storyItem);
        });
    } catch (error) {
        console.error('Failed to load stories:', error);
    }
}

// Load specific story
async function loadStory(storyId, event) {
    try {
        const response = await fetch(`${API_BASE_URL}/stories/${storyId}`);
        const data = await response.json();
        
        currentStoryId = storyId;
        storyMessages.innerHTML = '';
        
        // Load child profile
        if (data.childProfile) {
            childName.value = data.childProfile.name || '';
            childAge.value = data.childProfile.age || '';
            if (data.childProfile.gender === 'male') {
                genderMale.checked = true;
            } else if (data.childProfile.gender === 'female') {
                genderFemale.checked = true;
            }
            
            // Update display elements
            updateProfileDisplay(data.childProfile);
        } else {
            // Clear profile display if no profile exists
            childName.value = '';
            childAge.value = '';
            genderMale.checked = false;
            genderFemale.checked = false;
            updateProfileDisplay({ name: '', age: null, gender: null });
        }
        
        if (data.messages.length === 0) {
            storyMessages.innerHTML = `
                <div class="welcome-message">
                    <h2>🌈 欢迎来到故事世界</h2>
                    <p>小朋友，你想创作什么样的故事呢？</p>
                    <p class="hint">先在右边填写你的信息，然后开始创作吧！</p>
                </div>
            `;
        } else {
            data.messages.forEach(msg => {
                addMessageToUI(msg.role, msg.content, msg.imageUrl);
            });
        }
        
        // Update active state
        document.querySelectorAll('.story-item').forEach(item => {
            item.classList.remove('active');
        });
        if (event && event.currentTarget) {
            event.currentTarget.classList.add('active');
        }
        
    } catch (error) {
        console.error('Failed to load story:', error);
        showError('加载故事失败');
    }
}

// Delete story
async function deleteStory(storyId) {
    if (!confirm('确定要删除这个故事吗？')) {
        return;
    }
    
    try {
        await fetch(`${API_BASE_URL}/stories/${storyId}`, {
            method: 'DELETE'
        });
        
        if (storyId === currentStoryId) {
            createNewStory();
        } else {
            loadStories();
        }
    } catch (error) {
        console.error('Failed to delete story:', error);
        showError('删除故事失败');
    }
}

// Show error message
function showError(message) {
    const errorDiv = document.createElement('div');
    errorDiv.className = 'error-message';
    errorDiv.textContent = message;
    storyMessages.appendChild(errorDiv);
    storyMessages.scrollTop = storyMessages.scrollHeight;
    
    setTimeout(() => {
        errorDiv.remove();
    }, 3000);
}
