const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const path = require('path');
const fs = require('fs');
const OpenAI = require('openai');

// Load environment variables
dotenv.config();

const app = express();
const PORT = process.env.PORT || 7891;

// Create images directory if not exists
const IMAGES_DIR = path.join(__dirname, 'public', 'images', 'stories');
if (!fs.existsSync(IMAGES_DIR)) {
    fs.mkdirSync(IMAGES_DIR, { recursive: true });
}

// Middleware
app.use(cors());
app.use(express.json());

// Serve landing page as homepage (before static middleware)
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'landing.html'));
});

// Explicitly serve index.html for the app
app.get('/index.html', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Static files (excluding index.html as root)
app.use(express.static('public', {
    index: false  // Don't serve index.html automatically
}));

// Store story conversations and child info (in production, use a database)
const stories = new Map();
const childProfiles = new Map();

// Initialize OpenAI client with Alibaba Cloud Bailian configuration
const client = new OpenAI({
    apiKey: process.env.DASHSCOPE_API_KEY,
    baseURL: 'https://dashscope.aliyuncs.com/compatible-mode/v1'
});

// System prompts
const IMAGE_DECISION_PROMPT = `你是一个儿童故事插图助手。根据当前的故事上下文，判断是否需要生成插图。

判断标准：
1. 故事进入新的场景或环境时，需要生成插图
2. 出现重要的新角色时，需要生成插图
3. 发生关键事件或转折点时，需要生成插图
4. 仅对话或简单描述时，不需要生成插图

请只回答 "YES" 或 "NO"，不要有其他内容。`;

const STORY_GUIDANCE_PROMPT = `你是一个温柔的故事副导演，帮助孩子共创故事。核心理念："孩子是故事的导演，AI是温柔的副导演"。

你的回应要求：

1. 首先对小作者的输入给予肯定和鼓励，认可他们的创意和想象力。

2. 然后根据小作者的输入，结合当前故事情节，生成更详细、生动的故事描述，帮助丰富故事内容。描述要具体、有画面感，适合儿童理解。

3. 最后用提问的方式引导孩子继续创作，根据不同年龄采用不同的提问策略：
   - 4岁及以下：简单直接的提问，如"接下来发生了什么呢？"
   - 5-6岁：在推进情节的同时，适当加入因果关系的探索，如"为什么会这样呢？"
   - 7岁及以上：加入假设性思考，激发更深层的想象，如"如果...会怎么样呢？"

重要提示：
- 不要使用【】标记或固定格式，要用自然流畅的对话方式表达
- 将肯定、描述、提问自然地融合在一起，像朋友聊天一样
- 不要给出具体的情节选项或答案
- 保持开放式提问，让孩子自由发挥
- 尊重孩子的创意，不要主导故事方向
- 语言要温柔、生动、充满童趣
- 回应要简洁，避免过长的段落`;

function getStoryGuidanceSystemPrompt(childName, childAge, childGender) {
    const age = childAge || 6;
    let ageGuidance = '';
    
    if (age <= 4) {
        ageGuidance = '请用最简单直接的方式提问，重点关注"接下来发生了什么"这类推进情节的问题。';
    } else if (age <= 6) {
        ageGuidance = '请在推进情节的同时，适当加入"为什么会这样"这类探索因果关系的提问。';
    } else {
        ageGuidance = '请加入"如果...会怎么样呢"这类假设性思考的提问，激发更深层次的想象力。';
    }
    
    return `${STORY_GUIDANCE_PROMPT}

当前创作者信息：
- 姓名：${childName || '小朋友'}
- 年龄：${age}岁
- 性别：${childGender === 'male' ? '男孩' : childGender === 'female' ? '女孩' : '未知'}

年龄相关引导策略：${ageGuidance}

请用自然流畅的对话方式回应，将肯定、描述和提问有机地融合在一起，就像一个温柔的朋友在和孩子聊天一样。回应要简洁、生动、充满童趣。`;
}

// Story co-creation endpoint
app.post('/api/chat', async (req, res) => {
    try {
        const { message, storyId, childProfile } = req.body;

        if (!message) {
            return res.status(400).json({ error: 'Message is required' });
        }

        // Save child profile if provided
        if (childProfile) {
            childProfiles.set(storyId, childProfile);
        }

        // Get child profile and story history
        const profile = childProfiles.get(storyId) || {};
        let history = stories.get(storyId) || [];

        // Add user message to history
        history.push({
            role: 'user',
            content: message
        });

        // Step 1: Decide if image generation is needed
        let imageUrl = null;
        const needsImage = await decideImageGeneration(history);
        console.log('Needs image:', needsImage);
        if (needsImage) {
            imageUrl = await generateStoryImage(history, message);
        }

        // Step 2: Generate story guidance
        const guidanceMessage = await generateStoryGuidance(history, profile);

        // Add assistant message to history
        const assistantResponse = {
            role: 'assistant',
            content: guidanceMessage,
            imageUrl: imageUrl
        };
        
        history.push(assistantResponse);

        // Save updated history
        stories.set(storyId, history);

        res.json({
            response: guidanceMessage,
            imageUrl: imageUrl,
            storyId: storyId
        });

    } catch (error) {
        console.error('Story creation error:', error);
        res.status(500).json({ 
            error: 'Failed to process story request',
            details: error.message 
        });
    }
});

// Generate AI greeting for new story
app.post('/api/greeting', async (req, res) => {
    try {
        const { storyId, childProfile } = req.body;
        
        if (!childProfile || !childProfile.name || !childProfile.age || !childProfile.gender) {
            return res.status(400).json({ error: 'Child profile is required' });
        }
        
        // Save profile
        childProfiles.set(storyId, childProfile);
        
        const { name, age, gender } = childProfile;
        const genderText = gender === 'male' ? '男生' : '女生';
        
        // Generate personalized greeting using AI
        try {
            const greetingPrompt = `你是一个温柔的儿童故事创作助手。请为一个名叫${name}的${age}岁${genderText}生成一句欢迎词，鼓励TA开始创作故事。

要求：
1. 语气温暖、鼓励
2. 符合${age}岁孩子的语言风格
3. 格式为："你好，${name}，作为一个${age}岁的${genderText}，..."
4. 激发创作热情，邀请开始故事创作
5. 一句话即可，不要过长`;
            
            const completion = await client.chat.completions.create({
                model: 'qwen-turbo',
                messages: [
                    { role: 'user', content: greetingPrompt }
                ],
                temperature: 0.9,
                max_tokens: 100
            });
            
            const greeting = completion.choices[0].message.content;
            
            res.json({ greeting });
        } catch (aiError) {
            console.error('AI greeting generation failed:', aiError);
            // Fallback to template greeting
            const greeting = `你好，${name}，作为一个${age}岁的${genderText}，今天又有什么新奇的想法呢？快来和我一起将你的想法创作为一个故事吧！`;
            res.json({ greeting });
        }
    } catch (error) {
        console.error('Greeting generation error:', error);
        res.status(500).json({ 
            error: 'Failed to generate greeting',
            details: error.message 
        });
    }
});

// Decide if image generation is needed
async function decideImageGeneration(history) {
    try {
        // Only check for image if there's substantial conversation
        if (history.length < 2) return false;

        const recentContext = history.slice(-6).map(msg => 
            `${msg.role}: ${msg.content}`
        ).join('\n');

        const decision = await client.chat.completions.create({
            model: 'qwen-turbo',
            messages: [
                { role: 'system', content: IMAGE_DECISION_PROMPT },
                { role: 'user', content: `故事上下文：\n${recentContext}\n\n是否需要生成插图？` }
            ],
            temperature: 0.3
        });

        const answer = decision.choices[0].message.content.trim().toUpperCase();
        return answer.includes('YES');
    } catch (error) {
        console.error('Image decision error:', error);
        return false;
    }
}

// Generate story image
async function generateStoryImage(history, latestMessage) {
    try {
        console.log('Generating story image...');
        
        // Build context from recent conversation history - ONLY user messages
        const recentHistory = history.slice(-6); // Last 6 messages for context
        const userMessages = recentHistory
            .filter(msg => msg.role === 'user') // Only include user (child) messages
            .map(msg => msg.content)
            .join('。');
        
        // Create comprehensive image prompt with story context from user input only
        const imagePrompt = `儿童故事绘本插图风格，可爱温馨的画风，色彩明亮鲜艳，简单的线条，适合儿童阅读。

孩子创作的故事内容：${userMessages}

当前场景：${latestMessage}

画面要求：展现当前场景的关键元素，符合儿童审美，温暖友好的氛围，插图中不要包含故事描述相关的任何文字内容。`;

        // Call image generation API (using Alibaba Cloud Z-Image-Turbo)
        const response = await fetch('https://dashscope.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${process.env.DASHSCOPE_API_KEY}`
            },
            body: JSON.stringify({
                model: 'qwen-image-max',
                input: {
                    messages: [
                        {
                            role: 'user',
                            content: [
                                {
                                    text: imagePrompt
                                }
                            ]
                        }
                    ]
                },
                parameters: {
                    prompt_extend: false,
                    size: '512*512'
                }
            })
        });
        
        if (!response.ok) {
            const errorText = await response.text();
            console.error('Image generation failed:', response.status, errorText);
            return null;
        }

        const result = await response.json();
        
        // Handle different response formats
        let imageUrl = null;
        
        // Try qwen-image-max format: output.choices[0].message.content[0].image
        if (result.output && result.output.choices && result.output.choices.length > 0) {
            const choice = result.output.choices[0];
            if (choice.message && choice.message.content) {
                const imageContent = choice.message.content.find(item => item.image);
                if (imageContent && imageContent.image) {
                    imageUrl = imageContent.image;
                    console.log('Image URL extracted from choices format:', imageUrl);
                }
            }
        }
        
        // Fallback: Try direct output.results format (older APIs)
        if (!imageUrl && result.output && result.output.results && result.output.results.length > 0) {
            imageUrl = result.output.results[0].url;
            console.log('Image URL extracted from results format:', imageUrl);
        }
        
        // Fallback: Try direct output.image_url format
        if (!imageUrl && result.output && result.output.image_url) {
            imageUrl = result.output.image_url;
            console.log('Image URL extracted from image_url format:', imageUrl);
        }
        
        if (!imageUrl) {
            console.error('No image URL found in response. Full response:', JSON.stringify(result, null, 2));
            return null;
        }
        
        // Download and save image locally
        return await downloadAndSaveImage(imageUrl);
    } catch (error) {
        console.error('Image generation error:', error);
        return null;
    }
}

// Download image from URL and save locally
async function downloadAndSaveImage(imageUrl) {
    try {
        console.log('Attempting to download image from:', imageUrl);
        
        // Validate URL
        if (!imageUrl || typeof imageUrl !== 'string') {
            console.error('Invalid image URL:', imageUrl);
            return null;
        }
        
        // Parse URL to ensure it's valid
        let parsedUrl;
        try {
            parsedUrl = new URL(imageUrl);
        } catch (urlError) {
            console.error('Invalid URL format:', imageUrl, urlError);
            return null;
        }
        
        console.log('Parsed URL:', parsedUrl.href);
        
        const imageResponse = await fetch(parsedUrl.href, {
            method: 'GET',
            headers: {
                'User-Agent': 'Mozilla/5.0 (compatible; StoryBuddy/1.0)'
            }
        });
        
        console.log('Image download response status:', imageResponse.status);
        
        if (!imageResponse.ok) {
            console.error('Failed to download image:', imageResponse.status, imageResponse.statusText);
            return null;
        }

        const arrayBuffer = await imageResponse.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);
        
        console.log('Downloaded image size:', buffer.length, 'bytes');
        
        if (buffer.length === 0) {
            console.error('Downloaded image is empty');
            return null;
        }
        
        // Generate unique filename
        const timestamp = Date.now();
        const filename = `story_${timestamp}.png`;
        const filePath = path.join(IMAGES_DIR, filename);
        
        // Save image to local directory
        fs.writeFileSync(filePath, buffer);
        
        // Return relative URL path for frontend
        const localUrl = `/images/stories/${filename}`;
        console.log(`Image saved successfully: ${localUrl}`);
        
        return localUrl;
    } catch (error) {
        console.error('Error downloading/saving image:', error);
        console.error('Error details:', {
            message: error.message,
            code: error.code,
            cause: error.cause
        });
        return null;
    }
}

// Generate story guidance
async function generateStoryGuidance(history, profile) {
    try {
        const systemPrompt = getStoryGuidanceSystemPrompt(
            profile.name,
            profile.age,
            profile.gender
        );

        const completion = await client.chat.completions.create({
            model: 'qwen-turbo',
            messages: [
                { role: 'system', content: systemPrompt },
                ...history.map(msg => ({
                    role: msg.role,
                    content: msg.content
                }))
            ],
            temperature: 0.8,
            max_tokens: 200
        });

        return completion.choices[0].message.content;
    } catch (error) {
        console.error('Guidance generation error:', error);
        return '真棒！接下来会发生什么呢？';
    }
}

// Get story history
app.get('/api/stories/:id', (req, res) => {
    const storyId = req.params.id;
    const history = stories.get(storyId) || [];
    const profile = childProfiles.get(storyId) || {};
    res.json({ messages: history, childProfile: profile });
});

// List all stories
app.get('/api/stories', (req, res) => {
    const storyList = [];
    stories.forEach((messages, id) => {
        // Only include stories that have at least one user message
        const hasUserMessage = messages.some(msg => msg.role === 'user');
        if (!hasUserMessage) {
            return;  // Skip stories without user input
        }
        
        const profile = childProfiles.get(id) || {};
        const firstUserMsg = messages.find(msg => msg.role === 'user');
        storyList.push({
            id: id,
            messages: messages,
            title: firstUserMsg ? firstUserMsg.content.substring(0, 30) + '...' : '新故事',
            messageCount: messages.length,
            lastMessage: messages.length > 0 ? messages[messages.length - 1].content.substring(0, 50) + '...' : '',
            childName: profile.name || '小朋友',
            childProfile: profile,
            createdAt: parseInt(id)
        });
    });
    res.json({ stories: storyList });
});

// Create new story
app.post('/api/stories', (req, res) => {
    const storyId = Date.now().toString();
    stories.set(storyId, []);
    
    // Save child profile if provided
    if (req.body.childProfile) {
        childProfiles.set(storyId, req.body.childProfile);
    }
    
    res.json({ storyId, createdAt: new Date().toISOString() });
});

// Delete story
app.delete('/api/stories/:id', (req, res) => {
    const storyId = req.params.id;
    stories.delete(storyId);
    childProfiles.delete(storyId);
    res.json({ success: true });
});

// Update child profile
app.post('/api/profile/:storyId', (req, res) => {
    const storyId = req.params.storyId;
    const profile = req.body;
    childProfiles.set(storyId, profile);
    res.json({ success: true, profile });
});

// Get child profile
app.get('/api/profile/:storyId', (req, res) => {
    const storyId = req.params.storyId;
    const profile = childProfiles.get(storyId) || {};
    res.json({ profile });
});

// Health check
app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.listen(PORT, () => {
    console.log(`StoryBuddy (故事伙伴) server is running on http://localhost:${PORT}`);
    console.log(`Core concept: "孩子是故事的导演，AI是温柔的副导演"`);
    console.log(`Make sure to set DASHSCOPE_API_KEY in .env file`);
});
