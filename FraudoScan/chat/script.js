document.addEventListener('DOMContentLoaded', () => {
    const chatBox = document.getElementById('chat-box');
    const messageInput = document.getElementById('message-input');
    const sendButton = document.getElementById('send-button');
    const riskLevelBar = document.getElementById('risk-level');

    const safeSound = new Audio('Sounds/receive.mp3'); // Renamed for clarity
    const warningSound = new Audio('Sounds/may-be-danger.mp3'); // New sound for warning
    const dangerSound = new Audio('Sounds/danger.mp3'); // New sound for danger

    const OPENROUTER_API_KEY = "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";
    const TENOR_API_KEY = "AIzaSyCJ5V378rQX8ptfoFyCz8LSDemhk9yTMqs";
    const GEMINI_API_KEY = "AIzaSyA8IPLhyHw8PweyUAR7YM152f9rcPkVX9s";

    let currentAIModel = 'deepseek'; // Default to DeepSeek

    // Cache for recently used GIF URLs to avoid immediate repeats
    const gifHistory = []; // Changed to array to manage order
    const MAX_GIF_HISTORY = 50; // Keep track of last 50 GIFs to avoid immediate repetition

    const addMessage = (message, sender) => {
        const messageElement = document.createElement('div');
        messageElement.classList.add('chat-message', `${sender}-message`);

        if (message === 'Analyzing...') {
            const loader = document.createElement('div');
            loader.classList.add('bouncing-loader');
            for (let i = 0; i < 3; i++) {
                loader.appendChild(document.createElement('div'));
            }
            messageElement.appendChild(loader);
        } else {
            const textElement = document.createElement('p');
            textElement.textContent = message;
            messageElement.appendChild(textElement);
        }

        chatBox.appendChild(messageElement);
        chatBox.scrollTop = chatBox.scrollHeight;
    };

    const updateRiskMeter = (riskLevel) => { // Changed parameter name to riskLevel
        riskLevelBar.classList.remove('risk-safe', 'risk-warning', 'risk-danger');
        const lowerCaseRiskLevel = riskLevel.toLowerCase(); // Use riskLevel directly

        // Enhanced logic for risk classification
        if (lowerCaseRiskLevel.includes('safe') || lowerCaseRiskLevel.includes('low') || lowerCaseRiskLevel.includes('no risk')) {
            riskLevelBar.classList.add('risk-safe');
        } else if (lowerCaseRiskLevel.includes('potential') || lowerCaseRiskLevel.includes('moderate') || lowerCaseRiskLevel.includes('warning')) {
            riskLevelBar.classList.add('risk-warning');
        } else if (lowerCaseRiskLevel.includes('danger') || lowerCaseRiskLevel.includes('high') || lowerCaseRiskLevel.includes('fraud')) {
            riskLevelBar.classList.add('risk-danger');
        } else {
            // Default to safe if no specific risk is identified, or if the AI response is ambiguous
            riskLevelBar.classList.add('risk-safe');
        }
        console.log("Risk meter bar classes after update:", riskLevelBar.classList); // Debugging
    };

    const fetchGif = async (keyword) => {
        if (!keyword) return null;
        // Fetch up to 50 GIFs and pick one randomly for more variety
        const url = `https://tenor.googleapis.com/v2/search?q=${encodeURIComponent(keyword)}&key=${TENOR_API_KEY}&client_key=fraudscanai&limit=50`;
        try {
            const response = await fetch(url);
            if (!response.ok) {
                throw new Error(`Tenor API HTTP error! status: ${response.status}`);
            }
            const data = await response.json();
            if (data.results && data.results.length > 0) {
                // Filter out GIFs that are in history
                const availableGifs = data.results.filter(gif => !gifHistory.includes(gif.media_formats.gif.url));

                let selectedGifUrl = null;
                if (availableGifs.length > 0) {
                    const randomIndex = Math.floor(Math.random() * availableGifs.length);
                    selectedGifUrl = availableGifs[randomIndex].media_formats.gif.url;
                } else {
                    // If all available GIFs are in history, clear history and pick randomly from all results
                    console.warn("All GIFs for this keyword are in history. Clearing history for this keyword and picking randomly.");
                    gifHistory.length = 0; // Clear array
                    const randomIndex = Math.floor(Math.random() * data.results.length);
                    selectedGifUrl = data.results[randomIndex].media_formats.gif.url;
                }

                // Add selected GIF to history and manage history size
                if (selectedGifUrl) {
                    gifHistory.push(selectedGifUrl);
                    if (gifHistory.length > MAX_GIF_HISTORY) {
                        gifHistory.shift(); // Remove the oldest entry
                    }
                }
                return selectedGifUrl;
            }
            return null;
        } catch (error) {
            console.error("Error fetching GIF:", error);
            return null;
        }
    };

    const handleSendMessage = async () => {
        console.log("handleSendMessage entered."); // Debugging
        const message = messageInput.value.trim();
        if (!message) return;

        addMessage(message, 'user');
        messageInput.value = '';

        const lowerCaseMessage = message.toLowerCase();
        const greetings = ['hi', 'hello', 'how are you', 'hey'];

        if (greetings.includes(lowerCaseMessage)) {
            addMessage('Hello! How can I help you today?', 'bot');
            return;
        }

        addMessage('Analyzing...', 'bot');

        let riskAnalysisText = 'An error occurred. Please try again.';
        let gifKeyword = 'error';
        let modelUsed = 'none';
        let actualRiskLevel = 'unknown';
        let suggestions = [];

        let apiSuccess = false;
        let apiErrorMessage = '';
        let retryCount = 0;
        const MAX_RETRIES = 1; // Allow one retry after switching models

        while (retryCount <= MAX_RETRIES && !apiSuccess) {
            try {
                console.log(`Attempting API call with ${currentAIModel} (Retry: ${retryCount})...`);

                let responseData;
                let responseText;
                let apiEndpoint;
                let headers;
                let body;

                if (currentAIModel === 'deepseek') {
                    apiEndpoint = "https://openrouter.ai/api/v1/chat/completions";
                    headers = {
                        "Authorization": `Bearer ${OPENROUTER_API_KEY}`,
                        "Content-Type": "application/json"
                    };
                    body = JSON.stringify({
                        "model": "deepseek/deepseek-r1-0528:free",
                        "messages": [
                            {"role": "system", "content": "You are a concise fraud detection AI. Analyze the user's message for potential fraud, scams, or suspicious activity. Respond with a JSON object containing 'riskAnalysis' (string: 'safe', 'potential warning', or 'danger' along with reasons), 'gifKeyword' (string: a keyword for a relevant GIF), and 'suggestions' (array of strings: actionable advice). Keep your 'riskAnalysis' and 'reasons' very short and to the point, focusing on actionable suggestions."},
                            {"role": "user", "content": message}
                        ]
                    });
                    modelUsed = 'DeepSeek R1';
                } else if (currentAIModel === 'gemini') {
                    apiEndpoint = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`;
                    headers = {
                        "Content-Type": "application/json"
                    };
                    body = JSON.stringify({
                        "contents": [{
                            "parts": [{
                                "text": `Analyze the following message for potential fraud, scams, or suspicious activity. Respond with a JSON object containing 'riskAnalysis' (string: 'safe', 'potential warning', or 'danger' along with reasons), 'gifKeyword' (string: a keyword for a relevant GIF), and 'suggestions' (array of strings: actionable advice). Message: "${message}"`
                            }]
                        }]
                    });
                    modelUsed = 'Gemini 2.0 Flash';
                }

                const apiResponse = await fetch(apiEndpoint, {
                    method: "POST",
                    headers: headers,
                    body: body
                });

                if (apiResponse.ok) {
                    responseData = await apiResponse.json();
                    if (currentAIModel === 'deepseek') {
                        responseText = responseData.choices[0]?.message?.content;
                    } else if (currentAIModel === 'gemini') {
                        responseText = responseData.candidates[0]?.content?.parts[0]?.text;
                    }
                    
                    if (responseText) {
                        console.log(`${modelUsed} Raw Response Text:`, responseText);
                        try {
                            const jsonMatch = responseText.match(/```json\s*([\s\S]*?)\s*```/);
                            let jsonString = responseText;
                            if (jsonMatch && jsonMatch[1]) {
                                jsonString = jsonMatch[1];
                            } else {
                                jsonString = responseText.replace(/```json|```|\n### Analysis:[\s\S]*|\n### Explanation:[\s\S]*/g, '').trim();
                            }

                            const responseObject = JSON.parse(jsonString);

                            if (typeof responseObject.riskAnalysis === 'object' && responseObject.riskAnalysis !== null && typeof responseObject.riskAnalysis.riskLevel === 'string') {
                                actualRiskLevel = responseObject.riskAnalysis.riskLevel;
                                riskAnalysisText = `Risk: ${actualRiskLevel.toUpperCase()}. ${responseObject.riskAnalysis.reasons ? responseObject.riskAnalysis.reasons.join(', ') : ''}`;
                            } else if (typeof responseObject.riskAnalysis === 'string') {
                                actualRiskLevel = responseObject.riskAnalysis;
                                riskAnalysisText = responseObject.riskAnalysis;
                            } else {
                                console.warn(`${modelUsed}: riskAnalysis is not a string or expected object, defaulting.`);
                                riskAnalysisText = `${modelUsed}: Unexpected riskAnalysis format. Raw: ${responseText}`;
                            }

                            if (typeof responseObject.gifKeyword === 'string') {
                                gifKeyword = responseObject.gifKeyword;
                            } else {
                                console.warn(`${modelUsed}: gifKeyword is not a string, defaulting.`);
                            }

                            if (Array.isArray(responseObject.suggestions) && responseObject.suggestions.every(s => typeof s === 'string')) {
                                suggestions = responseObject.suggestions;
                            } else if (typeof responseObject.suggestions === 'string') {
                                suggestions = [responseObject.suggestions];
                            } else {
                                console.warn(`${modelUsed}: suggestions is not an array of strings, defaulting.`);
                            }
                            apiSuccess = true; // API call and parsing successful
                        } catch (parseError) {
                            console.error(`${modelUsed}: Failed to parse JSON response:`, parseError, "Raw Response Text:", responseText);
                            riskAnalysisText = `${modelUsed}: JSON parsing error. Raw: ${responseText}`;
                        }
                    } else {
                        console.warn(`${modelUsed}: No response text found.`);
                        riskAnalysisText = `${modelUsed}: No response.`;
                    }
                } else {
                    const errorText = await apiResponse.text();
                    throw new Error(`API (${modelUsed}) failed! Status: ${apiResponse.status} - ${errorText}`);
                }
            } catch (error) {
                console.error("API call failed:", error);
                apiErrorMessage = `API call failed: ${error.message}`;

                // If it's the first attempt and an error occurred, switch model and retry
                if (retryCount === 0) {
                    currentAIModel = (currentAIModel === 'deepseek') ? 'gemini' : 'deepseek';
                    addMessage(`API call failed with ${modelUsed}. Attempting to switch to ${currentAIModel.charAt(0).toUpperCase() + currentAIModel.slice(1)} model.`, 'bot');
                }
            }
            retryCount++;
        }

        if (!apiSuccess) {
            riskAnalysisText = `All API calls failed: ${apiErrorMessage}. Please check your API keys or try again later.`;
            gifKeyword = 'api error';
            actualRiskLevel = 'danger';
        }
        console.log("Risk Analysis from AI (raw):", riskAnalysisText);
        console.log("Actual Risk Level for meter:", actualRiskLevel);
        console.log("GIF Keyword:", gifKeyword);
        console.log("Suggestions:", suggestions);

        const botMessages = document.querySelectorAll('.bot-message');
        const lastBotMessage = botMessages[botMessages.length - 1];
        
        let fullBotMessageContent = `<p>${riskAnalysisText}</p>`;
        if (suggestions.length > 0) {
            fullBotMessageContent += `<p><strong>Suggestions:</strong></p><ul>`;
            suggestions.forEach(s => {
                fullBotMessageContent += `<li>${s}</li>`;
            });
            fullBotMessageContent += `</ul>`;
        }
        lastBotMessage.innerHTML = fullBotMessageContent; // Update the "Analyzing..." message with the risk analysis and suggestions

        // Fetch and display GIF
        const gifUrl = await fetchGif(gifKeyword);
        if (gifUrl) {
            const gifElement = document.createElement('img');
            gifElement.src = gifUrl;
            gifElement.classList.add('chat-gif');
            lastBotMessage.appendChild(gifElement);
        }

        updateRiskMeter(actualRiskLevel); // Pass the extracted risk level to update the meter
        
        try {
            const lowerCaseActualRiskLevel = actualRiskLevel.toLowerCase();
            if (lowerCaseActualRiskLevel.includes('safe') || lowerCaseActualRiskLevel.includes('low')) {
                safeSound.play();
            } else if (lowerCaseActualRiskLevel.includes('potential') || lowerCaseActualRiskLevel.includes('moderate') || lowerCaseActualRiskLevel.includes('warning')) {
                warningSound.play();
            } else if (lowerCaseActualRiskLevel.includes('danger') || lowerCaseActualRiskLevel.includes('high') || lowerCaseActualRiskLevel.includes('fraud')) {
                dangerSound.play();
            }
        } catch (e) {
            console.error("Error playing sound:", e);
        }

        const lowerCaseActualRiskLevel = actualRiskLevel.toLowerCase();
        if (lowerCaseActualRiskLevel.includes('safe') || lowerCaseActualRiskLevel.includes('low')) {
            lastBotMessage.classList.add('bot-message-safe');
        } else if (lowerCaseActualRiskLevel.includes('potential') || lowerCaseActualRiskLevel.includes('moderate') || lowerCaseActualRiskLevel.includes('warning')) {
            lastBotMessage.classList.add('bot-message-warning');
        } else if (lowerCaseActualRiskLevel.includes('danger') || lowerCaseActualRiskLevel.includes('high') || lowerCaseActualRiskLevel.includes('fraud')) {
            lastBotMessage.classList.add('bot-message-danger');
        }
        console.log("Applied classes to bot message:", lastBotMessage.classList); // Debugging: Log applied classes
    };

    sendButton.addEventListener('click', handleSendMessage);
    messageInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            handleSendMessage();
        }
    });

    addMessage('Hello! I am Fraud Scan AI. Paste any message here, and I will analyze it for potential fraud.', 'bot');

    const burgerCheckbox = document.getElementById('burger-checkbox');
    const menuContent = document.getElementById('menu-content');

    burgerCheckbox.addEventListener('change', () => {
        if (burgerCheckbox.checked) {
            menuContent.classList.add('show');
        } else {
            menuContent.classList.remove('show');
        }
    });

    // Close the hamburger menu dropdown if the user clicks outside of it or on a menu item
    window.addEventListener('click', (event) => {
        if (!event.target.closest('.hamburger-menu') && menuContent.classList.contains('show')) {
            burgerCheckbox.checked = false;
            menuContent.classList.remove('show');
        }
    });

    // New model switch button and menu logic
    const modelSwitchButton = document.getElementById('model-switch-button');
    const modelSwitchMenu = document.getElementById('model-switch-menu');
    const switchToDeepseekBtn = document.getElementById('switch-to-deepseek');
    const switchToGeminiBtn = document.getElementById('switch-to-gemini-from-menu'); // Updated ID

    modelSwitchButton.addEventListener('click', () => {
        modelSwitchMenu.classList.toggle('show');
    });

    // Close the model switch menu if the user clicks outside of it or on a menu item
    window.addEventListener('click', (event) => {
        if (!event.target.closest('.model-switch-container') && modelSwitchMenu.classList.contains('show')) {
            modelSwitchMenu.classList.remove('show');
        }
    });

    switchToDeepseekBtn.addEventListener('click', (e) => {
        e.preventDefault();
        currentAIModel = 'deepseek';
        addMessage('Switched to DeepSeek AI model.', 'bot');
        modelSwitchMenu.classList.remove('show'); // Close menu after selection
    });

    switchToGeminiBtn.addEventListener('click', (e) => {
        e.preventDefault();
        currentAIModel = 'gemini';
        addMessage('Switched to Gemini AI model.', 'bot');
        modelSwitchMenu.classList.remove('show'); // Close menu after selection
    });
});
