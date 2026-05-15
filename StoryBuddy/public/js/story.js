// API base URL
// API base URL - use relative path for deployment compatibility
const API_BASE_URL = '/api';

// State management
let currentStoryId = null;
let currentProfile = null;
let isWaitingForResponse = false;

// DOM elements
const storyMessages = document.getElementById('storyMessages');
const messageInput = document.getElementById('messageInput');
const sendBtn = document.getElementById('sendBtn');
const backBtn = document.getElementById('backBtn');
const childInfo = document.getElementById('childInfo');

// Initialize app
document.addEventListener('DOMContentLoaded', () => {
    initStory();
    setupEventListeners();
});

// Initialize story from URL parameter
async function initStory() {
    // Get storyId from URL parameter
    const urlParams = new URLSearchParams(window.location.search);
    currentStoryId = urlParams.get('storyId');
    
    if (!currentStoryId) {
        alert('没有找到故事ID');
        window.location.href = 'index.html';
        return;
    }
    
    // Load story content (which includes the original author's profile)
    await loadStory();
}

// Update header with child info
function updateHeaderInfo() {
    if (currentProfile && currentProfile.name) {
        const genderText = currentProfile.gender === 'male' ? '男孩' : '女孩';
        childInfo.textContent = `${currentProfile.name}（${currentProfile.age}岁${genderText}）正在创作...`;
    }
}

// Setup event listeners
function setupEventListeners() {
    // Back button
    backBtn.addEventListener('click', () => {
        window.location.href = 'index.html';
    });
    
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
}

// Load story
async function loadStory() {
    try {
        const response = await fetch(`${API_BASE_URL}/stories/${currentStoryId}`);
        
        if (!response.ok) {
            throw new Error('Story not found');
        }
        
        const data = await response.json();
        
        // Load the original author's profile from the story data
        if (data.childProfile) {
            currentProfile = data.childProfile;
            updateHeaderInfo();
        } else {
            // Fallback to localStorage if story has no profile (shouldn't happen)
            const savedProfile = localStorage.getItem('childProfile');
            if (savedProfile) {
                currentProfile = JSON.parse(savedProfile);
                updateHeaderInfo();
            }
        }
        
        // Load messages
        storyMessages.innerHTML = '';
        if (data.messages.length === 0) {
            // Show AI greeting
            await showAIGreeting();
        } else {
            data.messages.forEach(msg => {
                addMessageToUI(msg.role, msg.content, msg.imageUrl);
            });
        }
        
    } catch (error) {
        console.error('Failed to load story:', error);
        alert('加载故事失败');
        window.location.href = 'index.html';
    }
}

// Show AI greeting
async function showAIGreeting() {
    if (!currentProfile) return;
    
    try {
        const response = await fetch(`${API_BASE_URL}/greeting`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                storyId: currentStoryId,
                childProfile: currentProfile
            })
        });
        
        if (response.ok) {
            const data = await response.json();
            addMessageToUI('assistant', data.greeting);
        }
    } catch (error) {
        console.error('Failed to get greeting:', error);
        const genderText = currentProfile.gender === 'male' ? '男生' : '女生';
        const defaultGreeting = `你好，${currentProfile.name}，作为一个${currentProfile.age}岁的${genderText}，今天又有什么新奇的想法呢？快来和我一起将你的想法创作为一个故事吧！`;
        addMessageToUI('assistant', defaultGreeting);
    }
}

// Send message
async function sendMessage() {
    const message = messageInput.value.trim();
    
    if (!message || isWaitingForResponse) {
        return;
    }
    
    // Add user message to UI
    addMessageToUI('user', message);
    
    // Clear input
    messageInput.value = '';
    messageInput.style.height = 'auto';
    
    // Add loading indicator
    const loadingId = addLoadingIndicator();
    
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
                childProfile: currentProfile
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

// Add message to UI
function addMessageToUI(role, content, imageUrl = null) {
    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${role}-message`;
    
    const avatar = document.createElement('div');
    avatar.className = 'message-avatar';
    
    // Set avatar based on role and gender
    if (role === 'user') {
        if (currentProfile && currentProfile.gender === 'male') {
            avatar.textContent = '👦'; // Boy
        } else if (currentProfile && currentProfile.gender === 'female') {
            avatar.textContent = '👧'; // Girl
        } else {
            avatar.textContent = '👶'; // Default baby icon
        }
    } else {
        avatar.textContent = '⭐'; // AI star icon
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
    avatar.textContent = '⭐'; // AI star icon - consistent with assistant messages
    
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

// Show error message
function showError(message) {
    alert(message);
}
