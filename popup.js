const locationInput = document.getElementById('locationInput');
const addBtn = document.getElementById('addBtn');
const currentCityDiv = document.getElementById('currentCity');
const savedCitiesList = document.getElementById('savedCitiesList');

function getEmoji(code, isNight) {
    const codeMap = {
        "113": isNight ? '🌙' : '☀️', "116": isNight ? '☁️' : '⛅',
        "119": '☁️', "122": '☁️', "143": '🌫️', "176": '🌦️',
        "200": '⛈️', "248": '🌫️', "266": '🌧️', "296": '🌧️',
        "302": '🌧️', "395": '❄️'
    };
    return codeMap[code] || (isNight ? '🌙' : '☀️');
}

async function fetchWeather(city) {
    try {
        const res = await fetch(`https://wttr.in/${city}?format=j1`);
        return res.ok ? await res.json() : null;
    } catch { return null; }
}

function renderForecast(weatherArray) {
    let sidebarHTML = '<div class="date-sidebar">';
    let panelsHTML = '';

    weatherArray.forEach((day, i) => {
        const d = new Date(day.date);
        const months = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
        const active = i === 0 ? 'active' : '';
        
        sidebarHTML += `<div class="date-pill ${active}" data-index="${i}">
            <span class="pill-day">${d.getDate()}</span>
            <span class="pill-month">${months[d.getMonth()]}</span>
        </div>`;

        const slots = [{n:'Morning', h:2, ni:false}, {n:'Noon', h:4, ni:false}, {n:'Evening', h:6, ni:true}, {n:'Night', h:7, ni:true}];

        panelsHTML += `<div class="forecast-grid ${active}" data-panel="${i}">`;
        slots.forEach(s => {
            const h = day.hourly[s.h] || day.hourly[0];
            panelsHTML += `
                <div class="time-capsule">
                    <span class="seg-name">${s.n}</span>
                    <span style="font-size:20px; margin:4px 0;">${getEmoji(h.weatherCode, s.ni)}</span>
                    <span class="seg-temp">${h.tempC}°</span>
                    <span class="seg-desc">${h.weatherDesc[0].value}</span>
                    <div class="seg-divider"></div>
                    <div class="seg-info-block">
                        <div class="info-row">💧<span>${h.precipMM}mm</span></div>
                        <div class="info-row">☢️<span>UV ${h.uvIndex}</span></div>
                        <div class="info-row">🍃<span>${h.humidity}%</span></div>
                    </div>
                </div>`;
        });
        panelsHTML += `</div>`;
    });
    return `<div class="forecast-container">${sidebarHTML}</div>${panelsHTML}</div>`;
}

function createCardHTML(data, cityKey, isDeletable, customName) {
    const curr = data.current_condition[0];
    const name = customName || cityKey || data.nearest_area[0].areaName[0].value;
    const isNight = new Date().getHours() < 6 || new Date().getHours() > 19;

    return `
        <div class="location-card" data-city-key="${cityKey || ''}">
            ${isDeletable ? `<button class="delete-btn">✕</button>` : ''}
            <div class="card-header">
                <div class="header-left">
                    <div class="weather-icon-circle">${getEmoji(curr.weatherCode, isNight)}</div>
                    <div>
                        <h3 class="city-name">${name}</h3>
                        <div class="condition-text">${curr.weatherDesc[0].value}</div>
                        <div class="header-details">Feels: ${curr.FeelsLikeC}° | Wind: ${curr.windspeedKmph}km/h</div>
                    </div>
                </div>
                <div class="temp-pill">${curr.temp_C}°</div>
            </div>
            ${renderForecast(data.weather)}
        </div>`;
}

function setupEvents(card, isDeletable) {
    const cityNameEl = card.querySelector('.city-name');
    const cityKey = card.dataset.cityKey;

    if (isDeletable) {
        cityNameEl.onclick = (e) => {
            e.stopPropagation();
            const input = document.createElement('input');
            input.className = 'rename-input';
            input.value = cityNameEl.innerText;
            input.onblur = async () => {
                const r = await chrome.storage.local.get("names");
                const names = r.names || {};
                names[cityKey] = input.value;
                await chrome.storage.local.set({names});
                updateUI();
            };
            input.onkeydown = (ke) => { if(ke.key === 'Enter') input.blur(); };
            cityNameEl.replaceWith(input);
            input.focus();
        };
    }

    card.onclick = (e) => {
        if(e.target.classList.contains('delete-btn')) {
            chrome.storage.local.get("cities", (r) => {
                const list = (r.cities || []).filter(c => c !== cityKey);
                chrome.storage.local.set({cities: list}, updateUI);
            });
            return;
        }
        if(e.target.closest('.date-pill')) {
            const pill = e.target.closest('.date-pill');
            card.querySelectorAll('.date-pill, .forecast-grid').forEach(el => el.classList.remove('active'));
            pill.classList.add('active');
            card.querySelector(`[data-panel="${pill.dataset.index}"]`).classList.add('active');
            return;
        }
        card.classList.toggle('expanded');
    };
}

async function updateUI() {
    // Load Current Location
    const current = await fetchWeather("");
    if(current) {
        currentCityDiv.innerHTML = createCardHTML(current, null, false);
        setupEvents(currentCityDiv.querySelector('.location-card'), false);
    }

    // Load Saved Locations
    chrome.storage.local.get(["cities", "names"], async (r) => {
        savedCitiesList.innerHTML = "";
        const cities = r.cities || [];
        const customNames = r.names || {};
        
        for (const city of cities) {
            const data = await fetchWeather(city);
            if (data) {
                const wrapper = document.createElement('div');
                wrapper.innerHTML = createCardHTML(data, city, true, customNames[city]);
                const card = wrapper.firstElementChild;
                setupEvents(card, true);
                savedCitiesList.appendChild(card);
            }
        }
    });
}

addBtn.onclick = () => {
    const city = locationInput.value.trim();
    if(!city) return;
    chrome.storage.local.get("cities", (r) => {
        const list = r.cities || [];
        if(!list.includes(city)) {
            list.push(city);
            chrome.storage.local.set({cities: list}, () => {
                locationInput.value = "";
                updateUI();
            });
        }
    });
};
locationInput.onkeypress = (e) => { if(e.key === 'Enter') addBtn.onclick(); };

updateUI();