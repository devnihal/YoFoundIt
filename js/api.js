const FRONTEND_HOST = window.location.hostname;
const IS_DEV = FRONTEND_HOST === 'localhost' || FRONTEND_HOST === '127.0.0.1';

// When transitioning to production, the production backend URL will be used.
const HOST = IS_DEV ? 'http://localhost/YoFoundIt' : 'https://api.yourproductiondomain.com';

const endpoints = {
    login: `${HOST}/authentication/login.php`,
    register: `${HOST}/authentication/register.php`,
    checkSession: `${HOST}/authentication/checkSession.php`,
    logout: `${HOST}/authentication/logout.php`,
    addCategory: `${HOST}/categories/add.php`,
    addItem: `${HOST}/items/add.php`,
    getLatestItems: `${HOST}/items/get.php`,
    getItemDetails: `${HOST}/items/get_details.php`,
    getCategories: `${HOST}/categories/get.php`,
    getMyItems: `${HOST}/items/my_items.php`,
    deleteItem: `${HOST}/items/delete.php`,
    getMoreItems: `${HOST}/items/get_more.php`,
    claimItem: `${HOST}/items/claim.php`
};

/**
 * Handle user registration
 */
async function registerUser(userData) {
    try {
        const response = await fetch(endpoints.register, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(userData)
        });
        const result = await response.json();
        return { status: response.status, data: result };
    } catch (error) {
        console.error("Registration error:", error);
        return { status: 500, data: { success: false, message: "Network or Server Error" } };
    }
}

/**
 * Handle user login
 */
async function loginUser(credentials) {
    try {
        const response = await fetch(endpoints.login, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(credentials)
        });
        const result = await response.json();
        return { status: response.status, data: result };
    } catch (error) {
        console.error("Login error:", error);
        return { status: 500, data: { success: false, message: "Network or Server Error" } };
    }
}

/**
 * Handle session verification
 */
async function verifySession(token) {
    try {
        const response = await fetch(endpoints.checkSession, {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            }
        });
        const result = await response.json();
        return { status: response.status, data: result };
    } catch (error) {
        console.error("Session verification error:", error);
        return { status: 500, data: { success: false, message: "Network or Server Error" } };
    }
}

/**
 * Handle user logout
 */
async function logoutUser(token) {
    try {
        const response = await fetch(endpoints.logout, {
            method: 'POST', // Using POST as standard for state-changing logout
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            }
        });
        const result = await response.json();
        return { status: response.status, data: result };
    } catch (error) {
        console.error("Logout error:", error);
        return { status: 500, data: { success: false, message: "Network or Server Error" } };
    }
}

/**
 * Fetch categories
 */
async function fetchCategories(token) {
    try {
        const response = await fetch(endpoints.getCategories, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });
        const result = await response.json();
        return { status: response.status, data: result };
    } catch (error) {
        console.error("Fetch categories error:", error);
        return { status: 500, data: { success: false, message: "Network or Server Error" } };
    }
}

/**
 * Handle category creation
 */
async function createCategory(token, name) {
    try {
        const response = await fetch(endpoints.addCategory, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ name })
        });
        const result = await response.json();
        return { status: response.status, data: result };
    } catch (error) {
        console.error("Create category error:", error);
        return { status: 500, data: { success: false, message: "Network or Server Error" } };
    }
}

/**
 * Handle Add Item
 */
async function addItem(token, formData) {
    try {
        const response = await fetch(endpoints.addItem, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`
            },
            body: formData
        });
        const result = await response.json();
        return { status: response.status, data: result };
    } catch (error) {
        console.error("Add item error:", error);
        return { status: 500, data: { success: false, message: "Network or Server Error" } };
    }
}

/**
 * Fetch Home Feed
 */
async function fetchLatestItems(token = null) {
    try {
        const t = token || (typeof localStorage !== 'undefined' ? localStorage.getItem('yfi_token') : null);
        const options = { method: 'GET' };
        if (t) {
            options.headers = { 'Authorization': `Bearer ${t}` };
        }
        const response = await fetch(endpoints.getLatestItems, options);
        const result = await response.json();
        return { status: response.status, data: result };
    } catch (error) {
        console.error("Fetch items error:", error);
        return { status: 500, data: { success: false, message: "Network or Server Error" } };
    }
}

/**
 * Fetch More Items (pagination)
 * GET /items/get_more.php?last_id={lastId}
 */
async function fetchMoreItems(lastId, token = null) {
    try {
        const t = token || (typeof localStorage !== 'undefined' ? localStorage.getItem('yfi_token') : null);
        const options = { method: 'GET' };
        if (t) {
            options.headers = { 'Authorization': `Bearer ${t}` };
        }
        const response = await fetch(`${endpoints.getMoreItems}?last_id=${lastId}`, options);
        const result = await response.json();
        return { status: response.status, data: result };
    } catch (error) {
        console.error("Fetch more items error:", error);
        return { status: 500, data: { success: false, message: "Network or Server Error" } };
    }
}

/**
 * Fetch Item Details
 * GET /items/get_details.php?item_id={id}
 */
async function fetchItemDetails(itemId, token = null) {
    try {
        const t = token || (typeof localStorage !== 'undefined' ? localStorage.getItem('yfi_token') : null);
        const options = {
            method: 'GET'
        };
        if (t) {
            options.headers = {
                'Authorization': `Bearer ${t}`
            };
        }
        const response = await fetch(`${endpoints.getItemDetails}?item_id=${itemId}`, options);
        const result = await response.json();
        return { status: response.status, data: result };
    } catch (error) {
        console.error("Fetch item details error:", error);
        return { status: 500, data: { success: false, message: "Network or Server Error" } };
    }
}

/**
 * Fetch Current User's Items
 * GET /items/my_items.php
 */
async function fetchMyItems(token) {
    try {
        const response = await fetch(endpoints.getMyItems, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });
        const result = await response.json();
        return { status: response.status, data: result };
    } catch (error) {
        console.error("Fetch my items error:", error);
        return { status: 500, data: { success: false, message: "Network or Server Error" } };
    }
}

/**
 * Delete Item
 * POST /items/delete.php
 */
async function deleteItem(token, itemId) {
    try {
        const response = await fetch(endpoints.deleteItem, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ item_id: itemId })
        });
        const result = await response.json();
        return { status: response.status, data: result };
    } catch (error) {
        console.error("Delete item error:", error);
        return { status: 500, data: { success: false, message: "Network or Server Error" } };
    }
}

/**
 * Claim Item
 * POST /items/claim.php
 */
async function claimItem(token, itemId) {
    try {
        const response = await fetch(endpoints.claimItem, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ item_id: itemId })
        });
        const result = await response.json();
        return { status: response.status, data: result };
    } catch (error) {
        console.error("Claim item error:", error);
        return { status: 500, data: { success: false, message: "Network or Server Error" } };
    }
}
