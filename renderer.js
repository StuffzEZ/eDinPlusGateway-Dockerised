// renderer.js

// =============================================================================
// Helper Functions
// =============================================================================
function pad(num, size) {
  return num.toString().padStart(size, '0');
}

function getUserPrefix() {
  const username = document.getElementById('username')
    ? document.getElementById('username').value
    : (localStorage.getItem("USERNAME") || "Configurator");
  const password = document.getElementById('password')
    ? document.getElementById('password').value
    : (localStorage.getItem("PASSWORD") || "mode-x");
  console.log("DEBUG: getUserPrefix returns:", `$User,${username},${password};`);
  return `$User,${username},${password};`;
}

// =============================================================================
// Determining the Category and Type of Channel
// =============================================================================
function getChannelCategory(channelType) {
  const t = channelType.toUpperCase();
  console.log(`DEBUG: getChannelCategory called with type: ${channelType} (uppercase: ${t})`);
  
  // If it contains "RGB" or "TW" or "COLR", treat as color/temperature
  if (t.includes("RGB") || t.includes("TW") || t.includes("COLR")) {
    console.log(`DEBUG: Channel ${channelType} categorized as COLOR`);
    return "COLOR";
  }
  // Otherwise, treat it as a level-based channel
  console.log(`DEBUG: Channel ${channelType} categorized as LEVEL`);
  return "LEVEL";
}

function getColorType(channelType) {
  const t = channelType.toUpperCase();
  console.log(`DEBUG: getColorType called with type: ${channelType} (uppercase: ${t})`);
  
  if (t.includes("TW")) {
    console.log(`DEBUG: Channel ${channelType} identified as TW (Tunable White)`);
    return "TW"; // Tunable White
  } else if (t.includes("RGBW")) {
    console.log(`DEBUG: Channel ${channelType} identified as RGBW`);
    return "RGBW"; // RGBW (RGB + White)
  } else if (t.includes("RGB")) {
    console.log(`DEBUG: Channel ${channelType} identified as RGB`);
    return "RGB"; // RGB only
  }
  
  console.log(`DEBUG: Channel ${channelType} has UNKNOWN color type`);
  return "UNKNOWN";
}

// =============================================================================
// Global Variables for DALI Operations (unchanged)
// =============================================================================
let daliBroadcastInterval = null;
let daliBSTInterval = null;
let daliBSTState = true;
let daliFittingEMIdentifyInterval = null;
let flashDaliFittingInterval = null;
let flashDaliFittingState = true;

// =============================================================================
// Area Section Functions
// =============================================================================
function loadAreaNames() {
  createAreaTiles([]);
  sendCommand('?areanames;');
}

function parseAreaResponse(responseText) {
  const lines = responseText.split(/[\r\n]+/);
  const areas = [];
  lines.forEach(line => {
    line = line.trim();
    if (line.startsWith('!AREANAME,')) {
      if (line.endsWith(';')) {
        line = line.slice(0, -1);
      }
      const parts = line.split(',');
      if (parts.length >= 5) {
        const areaNum = parts[1].trim();
        const areaName = parts[4].trim();
        if (areaName !== '') {
          areas.push({ num: areaNum, name: areaName });
        }
      }
    }
  });
  return areas;
}

function createAreaTiles(areas) {
  const container = document.getElementById('tileContainer');
  if (!container) {
    console.error('Tile container not found!');
    return;
  }
  container.innerHTML = '';
  areas.forEach(area => {
    const btn = document.createElement('button');
    btn.classList.add('tile-button');
    btn.textContent = area.name;
    btn.addEventListener('click', () => {
      console.log('Tile clicked:', area.name, 'with area number:', area.num);
      const areaNumInt = parseInt(area.num, 10);
      sendCommand(`?SCNNAMES,${areaNumInt};`);
    });
    container.appendChild(btn);
  });
}

function parseSceneResponse(responseText) {
  const lines = responseText.split(/[\r\n]+/);
  const scenes = [];
  lines.forEach(line => {
    line = line.trim();
    if (line.startsWith('!SCNNAME,')) {
      if (line.endsWith(';')) {
        line = line.slice(0, -1);
      }
      const parts = line.split(',');
      if (parts.length >= 5) {
        const scnNum = parts[1].trim();
        const scnName = parts[4].trim();
        if (scnName !== '') {
          scenes.push({ num: scnNum, name: scnName });
        }
      }
    }
  });
  return scenes;
}

// =============================================================================
// Parsing Channel Names & States, Populating the Channel List
// =============================================================================
function parseChannelNames(responseText) {
  console.log("DEBUG: Raw channel names response:", responseText);
  
  const channels = [];
  const lines = responseText.split(/\r?\n/);
  lines.forEach(line => {
    line = line.trim();
    if (line === "") return;
    
    // Log each line for debugging
    console.log("DEBUG: Processing line:", line);
    
    if (
      line.startsWith('!CHANNAME,') ||
      line.startsWith('!DMXNAME,') ||
      line.startsWith('!DMXRGBCOLRNAME,') ||
      line.startsWith('!CHANRGBCOLRNAME,') || // Added CHANRGBCOLRNAME
      line.startsWith('!DALINAME,') ||
      line.startsWith('!CHANTWCOLRNAME,')
    ) {
      if (line.endsWith(';')) {
        line = line.slice(1, -1);
      } else {
        line = line.slice(1);
      }
      const parts = line.split(',');
      if (parts.length >= 7) {
        const channel = {
          type: parts[0],   // e.g. "CHANNAME", "DMXNAME", "DALINAME"
          addr: parts[1],
          devcode: parts[2],
          chanNum: parts[3],
          name: parts.slice(6).join(',')
        };
        
        // Log each parsed channel
        console.log("DEBUG: Parsed channel:", channel);
        
        channels.push(channel);
      }
    }
  });
  
  // Debug log to see what channels were parsed
  console.log("DEBUG: All parsed channels:", channels);
  
  return channels;
}

function parseChannelStates(responseText) {
  console.log("DEBUG: Raw channel states response:", responseText);
  
  const states = [];
  const lines = responseText.split(/\r?\n/);
  lines.forEach(line => {
    line = line.trim();
    if (!line) return;
    
    // Log each line for debugging
    console.log("DEBUG: Processing state line:", line);
    
    // For level channels, the 5th field (index 4) is the level
    if (
      line.startsWith('!CHANLEVEL,') ||
      line.startsWith('!DMXLEVEL,') ||
      line.startsWith('!DALILEVEL,')
    ) {
      if (line.endsWith(';')) line = line.slice(1, -1);
      else line = line.slice(1);
      const parts = line.split(',');
      if (parts.length >= 5) {
        let current = parseInt(parts[4], 10);
        if (isNaN(current)) current = 0;
        if (current > 255) current = 255;
        const state = {
          type: parts[0],    // e.g. "CHANLEVEL"
          chanNum: parts[3], 
          current: current
        };
        
        console.log("DEBUG: Parsed level state:", state);
        states.push(state);
      }
    }
    // For color or temperature channels
    else if (
      line.startsWith('!DMXRGBCOLR,') ||
      line.startsWith('!CHANRGBCOLR,') || // Added CHANRGBCOLR
      line.startsWith('!CHANTWCOLR,')
    ) {
      if (line.endsWith(';')) line = line.slice(1, -1);
      else line = line.slice(1);
      const parts = line.split(',');
      if (parts.length >= 5) {
        const state = {
          type: parts[0],    
          chanNum: parts[3],
          current: parts[4]
        };
        
        console.log("DEBUG: Parsed color state:", state);
        states.push(state);
      }
    }
  });
  
  console.log("DEBUG: All parsed states:", states);
  return states;
}

function populateChannelList(channels) {
  const container = document.getElementById('channelList');
  if (!container) return;
  container.innerHTML = "";
  
  channels.forEach(channel => {
    const channelDiv = document.createElement('div');
    channelDiv.classList.add('channel-item');
    
    // We'll store the "category" (LEVEL vs COLOR) in dataset.category
    const category = getChannelCategory(channel.type);
    const colorType = getColorType(channel.type);
    
    channelDiv.dataset.category = category;
    channelDiv.dataset.channum = channel.chanNum;
    channelDiv.dataset.colortype = colorType;
    
    // Also store raw type, addr, devcode so we can re-use them later
    channelDiv.dataset.type = channel.type; 
    channelDiv.dataset.addr = channel.addr;
    channelDiv.dataset.devcode = channel.devcode;
    
    // Show the channel name
    const nameEl = document.createElement('span');
    nameEl.textContent = channel.name;
    channelDiv.appendChild(nameEl);
    
    // If it's a level-based channel, show a slider & nudge buttons
    if (category === "LEVEL") {
      const slider = document.createElement('input');
      slider.type = "range";
      slider.min = 0;
      slider.max = 255;
      slider.value = 0; 
      slider.classList.add('channel-slider');
      slider.dataset.channum = channel.chanNum;
      
      const percSpan = document.createElement('span');
      percSpan.classList.add('channel-percentage');
      percSpan.textContent = "0%";
      
      // Nudge buttons
      const nudgeUp1 = document.createElement('button');
      nudgeUp1.textContent = "-1%";
      nudgeUp1.classList.add('nudge-button');
      nudgeUp1.addEventListener('click', () => nudgeSlider(slider, -1));
      
      const nudgeDown1 = document.createElement('button');
      nudgeDown1.textContent = "+1%";
      nudgeDown1.classList.add('nudge-button');
      nudgeDown1.addEventListener('click', () => nudgeSlider(slider, 1));
      
      const nudgeUp5 = document.createElement('button');
      nudgeUp5.textContent = "-5%";
      nudgeUp5.classList.add('nudge-button');
      nudgeUp5.addEventListener('click', () => nudgeSlider(slider, -5));
      
      const nudgeDown5 = document.createElement('button');
      nudgeDown5.textContent = "+5%";
      nudgeDown5.classList.add('nudge-button');
      nudgeDown5.addEventListener('click', () => nudgeSlider(slider, +5));
      
      // Update the percentage label whenever slider changes
      slider.addEventListener('input', () => {
        const percent = Math.round((parseInt(slider.value, 10) / 255) * 100);
        percSpan.textContent = percent + "%";
      });
      
      channelDiv.appendChild(slider);
      channelDiv.appendChild(percSpan);
      channelDiv.appendChild(nudgeUp1);
      channelDiv.appendChild(nudgeDown1);
      channelDiv.appendChild(nudgeUp5);
      channelDiv.appendChild(nudgeDown5);
    }
      else if (category === "COLOR") {
      // For color channels, add appropriate controls based on color type
      if (colorType === "RGB" || colorType === "RGBW") {
        // Add a color picker for RGB channels
        const colorPicker = document.createElement('input');
        colorPicker.type = "color";
        colorPicker.value = "#FF0000"; // Default to red
        colorPicker.classList.add('color-picker');
        
        const colorValueSpan = document.createElement('span');
        colorValueSpan.classList.add('color-value');
        colorValueSpan.textContent = "#FF0000";
        
        // Create container for RGB sliders
        const rgbSlidersContainer = document.createElement('div');
        rgbSlidersContainer.classList.add('rgb-sliders');
        
        // Create RGB sliders
        const colors = [
          { name: 'red', label: 'R', max: 255 },
          { name: 'green', label: 'G', max: 255 },
          { name: 'blue', label: 'B', max: 255 }
        ];
        
        // Helper function to convert hex to RGB
        const hexToRgb = (hex) => {
          const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
          return result ? {
            r: parseInt(result[1], 16),
            g: parseInt(result[2], 16),
            b: parseInt(result[3], 16)
          } : { r: 255, g: 0, b: 0 };
        };
        
        // Helper function to convert RGB to hex
        const rgbToHex = (r, g, b) => {
          return "#" + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1).toUpperCase();
        };
        
        // Create sliders for each RGB component
        colors.forEach(color => {
          const sliderRow = document.createElement('div');
          sliderRow.classList.add('rgb-slider-row');
          
          const label = document.createElement('span');
          label.classList.add('rgb-slider-label');
          label.textContent = color.label;
          label.style.color = color.name;
          
          const slider = document.createElement('input');
          slider.type = 'range';
          slider.min = 0;
          slider.max = color.max;
          slider.value = color.name === 'red' ? 255 : 0; // Default to red
          slider.classList.add('rgb-slider', color.name);
          
          const valueSpan = document.createElement('span');
          valueSpan.classList.add('rgb-slider-value');
          valueSpan.textContent = slider.value;
          
          // Update the color picker when the slider changes
          slider.addEventListener('input', () => {
            valueSpan.textContent = slider.value;
            
            // Get current RGB values from all sliders
            const redValue = parseInt(rgbSlidersContainer.querySelector('.rgb-slider.red').value);
            const greenValue = parseInt(rgbSlidersContainer.querySelector('.rgb-slider.green').value);
            const blueValue = parseInt(rgbSlidersContainer.querySelector('.rgb-slider.blue').value);
            
            // Update color picker
            const newHexColor = rgbToHex(redValue, greenValue, blueValue);
            colorPicker.value = newHexColor;
            colorValueSpan.textContent = newHexColor;
          });
          
          sliderRow.appendChild(label);
          sliderRow.appendChild(slider);
          sliderRow.appendChild(valueSpan);
          rgbSlidersContainer.appendChild(sliderRow);
        });
        
        // For RGBW channels, add a white slider
        if (colorType === "RGBW") {
          const sliderRow = document.createElement('div');
          sliderRow.classList.add('rgb-slider-row');
          
          const label = document.createElement('span');
          label.classList.add('rgb-slider-label');
          label.textContent = 'W';
          label.style.color = '#FFFFFF';
          
          const slider = document.createElement('input');
          slider.type = 'range';
          slider.min = 0;
          slider.max = 255;
          slider.value = 0; // Default to 0
          slider.classList.add('rgb-slider', 'white');
          
          const valueSpan = document.createElement('span');
          valueSpan.classList.add('rgb-slider-value');
          valueSpan.textContent = slider.value;
          
          // Update the value display when the slider changes
          slider.addEventListener('input', () => {
            valueSpan.textContent = slider.value;
          });
          
          sliderRow.appendChild(label);
          sliderRow.appendChild(slider);
          sliderRow.appendChild(valueSpan);
          rgbSlidersContainer.appendChild(sliderRow);
          
          // Add a label to indicate this is an RGBW channel
          const rgbwLabel = document.createElement('div');
          rgbwLabel.classList.add('rgbw-label');
          rgbwLabel.textContent = 'RGBW Channel';
          rgbwLabel.style.fontWeight = 'bold';
          rgbwLabel.style.marginTop = '5px';
          rgbwLabel.style.color = '#FFFFFF';
          rgbSlidersContainer.appendChild(rgbwLabel);
        }
        
        // Update RGB sliders when the color picker changes
        colorPicker.addEventListener('input', () => {
          const rgb = hexToRgb(colorPicker.value);
          colorValueSpan.textContent = colorPicker.value.toUpperCase();
          
          // Update sliders
          const redSlider = rgbSlidersContainer.querySelector('.rgb-slider.red');
          const greenSlider = rgbSlidersContainer.querySelector('.rgb-slider.green');
          const blueSlider = rgbSlidersContainer.querySelector('.rgb-slider.blue');
          
          redSlider.value = rgb.r;
          greenSlider.value = rgb.g;
          blueSlider.value = rgb.b;
          
          // Update slider value displays
          redSlider.nextElementSibling.textContent = rgb.r;
          greenSlider.nextElementSibling.textContent = rgb.g;
          blueSlider.nextElementSibling.textContent = rgb.b;
        });
        
        channelDiv.appendChild(colorPicker);
        channelDiv.appendChild(colorValueSpan);
        channelDiv.appendChild(rgbSlidersContainer);
      } 
      else if (colorType === "TW") {
        // Add a slider for tunable white (color temperature)
        const tempSlider = document.createElement('input');
        tempSlider.type = "range";
        tempSlider.min = 1800; // 1800K (warm)
        tempSlider.max = 6500; // 6500K (cool)
        tempSlider.value = 3000; // Default to 3000K
        tempSlider.step = 100;
        tempSlider.classList.add('temp-slider');
        
        const tempValueSpan = document.createElement('span');
        tempValueSpan.classList.add('temp-value');
        tempValueSpan.textContent = "3000K";
        
        // Update the temperature value display when the slider changes
        tempSlider.addEventListener('input', () => {
          tempValueSpan.textContent = `${tempSlider.value}K`;
          
          // Calculate background color to represent the color temperature
          // (simplified approximation)
          const temp = parseInt(tempSlider.value);
          const r = temp <= 3000 ? 255 : Math.max(255 - (temp - 3000) / 14, 200);
          const b = temp >= 3000 ? 255 : Math.max(255 - (3000 - temp) / 5, 100);
          const g = temp <= 3000 ? 
                    Math.min(200 + (temp - 1800) / 6, 255) : 
                    Math.min(255, 200 + (temp - 3000) / 14);
          
          tempSlider.style.backgroundColor = `rgb(${r}, ${g}, ${b})`;
        });
        
        // Trigger the input event to set the initial color
        tempSlider.dispatchEvent(new Event('input'));
        
        channelDiv.appendChild(tempSlider);
        channelDiv.appendChild(tempValueSpan);
      }
      else {
        // For unknown color types, just show the raw value
        const valueSpan = document.createElement('span');
        valueSpan.classList.add('channel-percentage');
        valueSpan.textContent = ""; 
        channelDiv.appendChild(valueSpan);
      }
    }
    
    container.appendChild(channelDiv);
  });
}

function nudgeSlider(slider, deltaPercent) {
  let currentPercent = Math.round((parseInt(slider.value, 10) / 255) * 100);
  let newPercent = currentPercent + deltaPercent;
  if (newPercent < 0) newPercent = 0;
  if (newPercent > 100) newPercent = 100;
  let newValue = Math.round((newPercent / 100) * 255);
  slider.value = newValue;
  slider.dispatchEvent(new Event('input'));
}

function updateChannelControls(states) {
  states.forEach(state => {
    const channelDiv = document.querySelector(`.channel-item[data-channum="${state.chanNum}"]`);
    if (channelDiv) {
      const category = channelDiv.dataset.category;
      const colorType = channelDiv.dataset.colortype;
      
      if (category === "LEVEL") {
        const slider = channelDiv.querySelector('.channel-slider');
        if (slider) {
          slider.value = state.current;
          const percent = Math.round((state.current / 255) * 100);
          const percSpan = channelDiv.querySelector('.channel-percentage');
          if (percSpan) {
            percSpan.textContent = percent + "%";
          }
        }
      }
      else if (category === "COLOR") {
        if (colorType === "RGB" || colorType === "RGBW") {
          // Update the color picker with the hex color value
          const colorPicker = channelDiv.querySelector('.color-picker');
          const colorValueSpan = channelDiv.querySelector('.color-value');
          
          if (colorPicker && state.current) {
            // For RGBW channels, the state might include both RGB and W values
            // Format could be "#RRGGBB,W" where W is the white value (0-255)
            let colorValue = state.current;
            let whiteValue = 0;
            
            // Check if the state includes a white value (comma-separated)
            if (colorValue.includes(',')) {
              const parts = colorValue.split(',');
              colorValue = parts[0]; // RGB part
              whiteValue = parseInt(parts[1], 10); // White part
              console.log(`DEBUG: RGBW state parsed - RGB: ${colorValue}, W: ${whiteValue}`);
            }
            
            // Make sure the color value is a valid hex color
            if (colorValue.startsWith('#')) {
              colorPicker.value = colorValue;
              if (colorValueSpan) {
                colorValueSpan.textContent = colorValue.toUpperCase();
              }
              
              // Also update the RGB sliders
              const rgbSlidersContainer = channelDiv.querySelector('.rgb-sliders');
              if (rgbSlidersContainer) {
                // Helper function to convert hex to RGB
                const hexToRgb = (hex) => {
                  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
                  return result ? {
                    r: parseInt(result[1], 16),
                    g: parseInt(result[2], 16),
                    b: parseInt(result[3], 16)
                  } : { r: 255, g: 0, b: 0 };
                };
                
                const rgb = hexToRgb(colorValue);
                
                // Update sliders
                const redSlider = rgbSlidersContainer.querySelector('.rgb-slider.red');
                const greenSlider = rgbSlidersContainer.querySelector('.rgb-slider.green');
                const blueSlider = rgbSlidersContainer.querySelector('.rgb-slider.blue');
                
                if (redSlider && greenSlider && blueSlider) {
                  redSlider.value = rgb.r;
                  greenSlider.value = rgb.g;
                  blueSlider.value = rgb.b;
                  
                  // Update slider value displays
                  const redValueSpan = redSlider.nextElementSibling;
                  const greenValueSpan = greenSlider.nextElementSibling;
                  const blueValueSpan = blueSlider.nextElementSibling;
                  
                  if (redValueSpan) redValueSpan.textContent = rgb.r;
                  if (greenValueSpan) greenValueSpan.textContent = rgb.g;
                  if (blueValueSpan) blueValueSpan.textContent = rgb.b;
                }
                
                // For RGBW channels, also update the white slider
                if (colorType === "RGBW") {
                  const whiteSlider = rgbSlidersContainer.querySelector('.rgb-slider.white');
                  if (whiteSlider) {
                    whiteSlider.value = whiteValue;
                    const whiteValueSpan = whiteSlider.nextElementSibling;
                    if (whiteValueSpan) {
                      whiteValueSpan.textContent = whiteValue;
                    }
                  }
                }
              }
            }
          }
        }
        else if (colorType === "TW") {
          // Update the temperature slider
          const tempSlider = channelDiv.querySelector('.temp-slider');
          const tempValueSpan = channelDiv.querySelector('.temp-value');
          
          if (tempSlider && state.current) {
            // Extract the temperature value from the format "#1800K"
            let tempValue = state.current;
            if (tempValue.includes('K')) {
              // Extract the numeric part before 'K'
              const tempMatch = tempValue.match(/(\d+)K/);
              if (tempMatch && tempMatch[1]) {
                const temp = parseInt(tempMatch[1], 10);
                if (!isNaN(temp) && temp >= 1800 && temp <= 6500) {
                  tempSlider.value = temp;
                  tempSlider.dispatchEvent(new Event('input')); // Trigger the input event to update display
                  
                  if (tempValueSpan) {
                    tempValueSpan.textContent = `${temp}K`;
                  }
                }
              }
            }
          }
        }
        else {
          // For unknown color types, just show the raw value
          const valueSpan = channelDiv.querySelector('.channel-percentage');
          if (valueSpan) {
            valueSpan.textContent = state.current;
          }
        }
      }
    }
  });
}

// =============================================================================
// Scene Buttons
// =============================================================================
function createSceneButtons(scenes) {
  const container = document.querySelector('.areawindowright');
  if (!container) {
    console.error('Scene container not found!');
    return;
  }
  container.innerHTML = '';
  scenes.forEach(scene => {
    const sceneContainer = document.createElement('div');
    sceneContainer.classList.add('scene-item');
    
    const sceneBtn = document.createElement('button');
    sceneBtn.classList.add('scene-button');
    sceneBtn.textContent = scene.name;
    sceneBtn.addEventListener('click', () => {
      console.log('Scene button clicked:', scene.name, 'with scene number:', scene.num);
      sendCommand(`$SCNRECALL,${scene.num};`);
    });
    
    const editBtn = document.createElement('button');
    editBtn.classList.add('scene-edit-button');
    editBtn.textContent = '⚙︎';
    editBtn.addEventListener('click', (event) => {
      event.stopPropagation();
      console.log('Edit button clicked for scene:', scene);
      openSceneEditModal(scene);
    });
    
    sceneContainer.appendChild(sceneBtn);
    sceneContainer.appendChild(editBtn);
    container.appendChild(sceneContainer);
  });
}

// =============================================================================
// Modal Functions
// =============================================================================
function openSceneEditModal(scene) {
  document.getElementById('modalSceneId').textContent = scene.num;
  document.getElementById('modalSceneName').textContent = scene.name;
  document.getElementById('channelList').innerHTML = "";
  document.getElementById('sceneEditModal').style.display = 'flex';
  
  // Ensure scrolling works properly
  document.body.style.overflow = 'hidden'; // Prevent body scrolling when modal is open
  
  window.currentEditingScene = scene;
  
  // 1) Trigger the scene with a fast fade.
  sendCommand(`$SCNRECALLX,${scene.num},255,1000;`);
  
  // 2) Wait 500ms, then request channel names.
  setTimeout(() => {
    sendCommand(`?SCNCHANNAMES,${scene.num};`);
  }, 500);
  
  // 3) Wait 600ms more, then request channel states.
  setTimeout(() => {
    sendCommand(`?SCNCHANSTATES,${scene.num};`);
  }, 1100);
}

function closeSceneEditModal() {
  document.getElementById('sceneEditModal').style.display = 'none';
  document.body.style.overflow = ''; // Restore body scrolling when modal is closed
}

// =============================================================================
// Save & Send Buttons
// =============================================================================

/**
 * Sends a SCNSAVE command for the current scene, waits 500ms, then closes modal.
 */
function saveSceneAndClose() {
  if (!window.currentEditingScene) {
    console.warn("No currentEditingScene found. Aborting save.");
    closeSceneEditModal();
    return;
  }
  const sceneNum = window.currentEditingScene.num;
  // 1) Send $SCNSAVE,<scn-num>;
  sendCommand(`$SCNSAVE,${sceneNum};`);
  // 2) Wait 500ms, then close
  setTimeout(() => {
    closeSceneEditModal();
  }, 500);
}

/**
 * Sends channel commands for each channel in the modal.
 * Fade time is hard-coded to 1000ms for now (you can make it user-configurable).
 */
function sendSceneChannelLevels() {
  const channelDivs = document.querySelectorAll('#channelList .channel-item');
  const fadeTime = 1000; // Hard-coded example fade time
  channelDivs.forEach(div => {
    const category = div.dataset.category;      // "LEVEL" or "COLOR"
    const colorType = div.dataset.colortype;    // "RGB", "TW", or "UNKNOWN"
    const type = div.dataset.type.toUpperCase(); // e.g. "CHANNAME", "DMXNAME", "DALINAME"
    const addr = div.dataset.addr;
    const devcode = div.dataset.devcode;
    const chanNum = div.dataset.channum;
    
    let cmd = null;
    
    if (category === "LEVEL") {
      // Retrieve the slider value for level-based channels
      const slider = div.querySelector('.channel-slider');
      if (!slider) return;
      const rawVal = parseInt(slider.value, 10) || 0;
      
      // Decide if we send CHANFADE, DMXFADE, or DALIFADE
      if (type.startsWith("CHANNAME")) {
        cmd = `$CHANFADE,${addr},${devcode},${chanNum},${rawVal},${fadeTime};`;
      } else if (type.startsWith("DMXNAME")) {
        cmd = `$DMXFADE,${addr},${devcode},${chanNum},${rawVal},${fadeTime};`;
      } else if (type.startsWith("DALINAME")) {
        cmd = `$DALIFADE,${addr},${devcode},${chanNum},${rawVal},${fadeTime};`;
      }
    }
    else if (category === "COLOR") {
      if (colorType === "RGB" || colorType === "RGBW") {
        // Get the color value from the color picker
        const colorPicker = div.querySelector('.color-picker');
        if (!colorPicker) return;
        const colorValue = colorPicker.value;
        
        // For RGBW channels, also get the white value
        let commandValue = colorValue;
        if (colorType === "RGBW") {
          const rgbSlidersContainer = div.querySelector('.rgb-sliders');
          if (rgbSlidersContainer) {
            const whiteSlider = rgbSlidersContainer.querySelector('.rgb-slider.white');
            if (whiteSlider) {
              const whiteValue = parseInt(whiteSlider.value, 10);
              // Append the white value to the color value
              commandValue = `${colorValue},${whiteValue}`;
              console.log(`DEBUG: Sending RGBW command with values: ${commandValue}`);
            }
          }
        }
        
        // Send RGB/RGBW color command - handle different types of RGB channels
        if (type.includes("RGB")) {
          // Log the command we're about to send for debugging
          console.log(`DEBUG: Sending RGB/RGBW command for channel type: ${type}`);
          
          // Use CHANRGBCOLR command for all RGB/RGBW channels
          cmd = `$CHANRGBCOLR,${addr},${devcode},${chanNum},${commandValue},${fadeTime};`;
        }
      }
      else if (colorType === "TW") {
        // Get the temperature value from the slider
        const tempSlider = div.querySelector('.temp-slider');
        if (!tempSlider) return;
        const tempValue = tempSlider.value;
        
        // Send tunable white command
        if (type.startsWith("CHANTWCOLR")) {
          cmd = `$CHANTWCOLR,${addr},${devcode},${chanNum},#${tempValue}K,${fadeTime};`;
        }
      }
    }
    
    if (cmd) {
      console.log("Sending command:", cmd);
      sendCommand(cmd);
    }
  });
}

// =============================================================================
// Settings Functions
// =============================================================================
function saveSettings() {
  const newSettings = {
    IP_ADDRESS: document.getElementById('ipAddress')
      ? document.getElementById('ipAddress').value
      : localStorage.getItem("IP_ADDRESS") || "192.168.1.100",
    USERNAME: document.getElementById('username')
      ? document.getElementById('username').value
      : localStorage.getItem("USERNAME") || "Configurator",
    PASSWORD: document.getElementById('password')
      ? document.getElementById('password').value
      : localStorage.getItem("PASSWORD") || "mode-x"
  };
  console.log("DEBUG: Saving Settings:", newSettings);
  window.electronAPI.updateSettings(newSettings);
  localStorage.setItem("IP_ADDRESS", newSettings.IP_ADDRESS);
  localStorage.setItem("USERNAME", newSettings.USERNAME);
  localStorage.setItem("PASSWORD", newSettings.PASSWORD);
}

function testConnection() {
  const prefix = getUserPrefix();
  const command = `${prefix}?VERSION;`;
  console.log("DEBUG: Sending Test Connection Command:", command);
  sendRawCommand(command);
}

function sendTestCommand() {
  const command = document.getElementById('testCommand').value;
  if (command) {
    sendCommand(command);
  }
}

function sendEventReportCommand(state) {
  const command = `$Events,${state};`;
  sendCommand(command);
  logMessage(`Sent Event Report ${state ? 'ON' : 'OFF'} command: ${command}`);
}

// =============================================================================
// Command Functions
// =============================================================================
function sendCommand(type) {
  try {
    const ip = localStorage.getItem("IP_ADDRESS") || "192.168.1.100";
    const connectionType = document.getElementById('connectionType')
      ? document.getElementById('connectionType').value
      : "http";
    const port = (connectionType === "tcp") ? 26 : 80;
    let url;
    if (connectionType === "tcp") {
      url = `${ip}:${port}`;
    } else {
      url = `http://${ip}:${port}/gateway?`;
    }
    const username = document.getElementById('username') ? document.getElementById('username').value : "";
    const password = document.getElementById('password') ? document.getElementById('password').value : "";
    let fullCommand = type;
    if (username && password) {
      fullCommand = `$User,${username},${password};` + type;
    }
    console.log("DEBUG: UI Sending Command:", fullCommand);
    console.log(`DEBUG: Connection Type: ${connectionType}, IP: ${ip}, Port: ${port}`);
    console.log(`DEBUG: URL: ${url}`);
    if (window.electronAPI) {
      window.electronAPI.sendCommand({ type: fullCommand, connection: connectionType, ip, port, url });
      console.log("DEBUG: Command sent via ipcRenderer.");
    } else {
      console.error("DEBUG: ipcRenderer (electronAPI) is NOT available! Check preload.js.");
    }
  } catch (error) {
    console.error("DEBUG: Error in sendCommand:", error);
  }
}

function sendKeypadCommand(buttonNumber) {
  const addr = document.getElementById('addr') ? document.getElementById('addr').value : "";
  const devcode = document.getElementById('devcode') ? document.getElementById('devcode').value : "";
  const state = document.getElementById('state') ? document.getElementById('state').value : "";
  const command = `$BTNSTATE,${addr},${devcode},${buttonNumber},${state};`;
  console.log("DEBUG: Sending Keypad Command:", command);
  sendCommand(command);
}

function sendChannelFadeCommand() {
  const addr = document.getElementById('channel-addr') ? document.getElementById('channel-addr').value : "";
  const devcode = document.getElementById('channel-devcode') ? document.getElementById('channel-devcode').value : "";
  const chanNum = document.getElementById('channel-num') ? document.getElementById('channel-num').value : "";
  const level = document.getElementById('channel-level') ? document.getElementById('channel-level').value : "";
  const fadetime = document.getElementById('channel-fadetime') ? document.getElementById('channel-fadetime').value : "";
  const command = `$CHANFADE,${addr},${devcode},${chanNum},${level},${fadetime};`;
  console.log("DEBUG: Sending Channel Fade Command:", command);
  sendCommand(command);
}

function sendRawCommand(message) {
  try {
    const ip = localStorage.getItem("IP_ADDRESS") || "192.168.1.100";
    const connectionType = document.getElementById('connectionType')
      ? document.getElementById('connectionType').value
      : "http";
    const port = (connectionType === "tcp") ? 26 : 80;
    let url;
    if (connectionType === "tcp") {
      url = `${ip}:${port}`;
    } else {
      url = `http://${ip}:${port}/gateway?`;
    }
    console.log("DEBUG: UI Sending Raw Command:", message);
    console.log(`DEBUG: URL for raw command: ${url}`);
    if (window.electronAPI) {
      window.electronAPI.sendCommand({ type: message, connection: connectionType, ip, port, url });
      console.log("DEBUG: Raw command sent via ipcRenderer.");
    } else {
      console.error("DEBUG: ipcRenderer (electronAPI) is NOT available! Check preload.js.");
    }
  } catch (error) {
    console.error("DEBUG: Error in sendRawCommand:", error);
  }
}

// =============================================================================
// Event Handlers
// =============================================================================
window.electronAPI.onLogMessage((message) => {
  console.log("DEBUG: UI Log Message Received:", message);
  
  // Handle button state messages
  if (message.startsWith('!BTNSTATE,')) {
    const parts = message.split(',');
    if (parts.length >= 2) {
      const plateAddress = parts[1];
      // Log the original message
      logMessage(message, "log-response");
      // Add the formatted plate message in green
      logMessage(`Plate ${plateAddress} Pressed`, "log-success");
    } else {
      logMessage(message, "log-response");
    }
  }
  // Handle input state messages
  else if (message.startsWith('!INPSTATE,')) {
    const parts = message.split(',');
    if (parts.length >= 4) {
      const address = parts[1];
      const input = parts[3];
      // Log the original message
      logMessage(message, "log-response");
      // Add the formatted input message in green
      logMessage(`INPUT ${address} Triggered ${input}`, "log-success");
    } else {
      logMessage(message, "log-response");
    }
  } 
  else {
    logMessage(message, "log-response");
  }
  
  if (message.includes("!AREANAME,")) {
    const areas = parseAreaResponse(message);
    createAreaTiles(areas);
  } 
  else if (message.includes("!SCNNAME,")) {
    const scenes = parseSceneResponse(message);
    createSceneButtons(scenes);
  }
  
  // If we got channel name data, build the channel list
  if (message.includes("SCNCHANNAMES") ||
      message.includes("!CHANNAME,") ||
      message.includes("!DMXNAME,") ||
      message.includes("!DMXRGBCOLRNAME,") ||
      message.includes("!CHANRGBCOLRNAME,") || // Added CHANRGBCOLRNAME
      message.includes("!DALINAME,") ||
      message.includes("!CHANTWCOLRNAME,")) {
    const channels = parseChannelNames(message);
    if(channels.length > 0) {
      populateChannelList(channels);
    }
  }
  
  // If we got channel state data, update the channel controls
  if (message.includes("!CHANLEVEL,") ||
      message.includes("!DMXLEVEL,") ||
      message.includes("!DALILEVEL,") ||
      message.includes("!DMXRGBCOLR,") ||
      message.includes("!CHANRGBCOLR,") || // Added CHANRGBCOLR
      message.includes("!CHANTWCOLR,")) {
    const states = parseChannelStates(message);
    if(states.length > 0) {
      updateChannelControls(states);
    }
  }
  
  if (message.includes("!VERSION")) {
    logMessage("Connection Successful", "log-success");
  }
});

window.electronAPI.onLoadSettings((settings) => {
  console.log("DEBUG: Loaded settings:", settings);
  if (document.getElementById('ipAddress') && settings.IP_ADDRESS) {
    document.getElementById('ipAddress').value = settings.IP_ADDRESS;
  }
  if (document.getElementById('username') && settings.USERNAME) {
    document.getElementById('username').value = settings.USERNAME;
  }
  if (document.getElementById('password') && settings.PASSWORD) {
    document.getElementById('password').value = settings.PASSWORD;
  }
});

// =============================================================================
// Logging & Startup
// =============================================================================
function logMessage(message, type = "log-message") {
  const logElement = document.getElementById('log');
  if (!logElement) {
    console.error("DEBUG: Log container not found!");
    return;
  }
  const newMessage = document.createElement("div");
  newMessage.classList.add(type);
  newMessage.textContent = message;
  logElement.appendChild(newMessage);
  const logContainer = document.getElementById('log-container');
  logContainer.scrollTop = logContainer.scrollHeight;
}

function clearLog() {
  console.log("DEBUG: Clearing Log...");
  if (document.getElementById('log')) {
    document.getElementById('log').textContent = "";
  }
}

// =============================================================================
// Global Channel Control Functions
// =============================================================================

/**
 * Sets all level-based channel sliders to a specific value (0-255)
 * For RGB channels, sets to either black (#000000) or white (#FFFFFF)
 * For TW channels, sets to either warm (1800K) or cool (6500K)
 * @param {number} value - The value to set (0-255)
 */
function setAllChannelsToValue(value) {
  // Set all level-based channel sliders
  const sliders = document.querySelectorAll('#channelList .channel-slider');
  sliders.forEach(slider => {
    slider.value = value;
    slider.dispatchEvent(new Event('input')); // Trigger the input event to update percentage display
  });
  
  // Set all RGB color pickers
  const colorPickers = document.querySelectorAll('#channelList .color-picker');
  colorPickers.forEach(picker => {
    // If value is 0, set to black, otherwise set to white
    picker.value = value === 0 ? '#000000' : '#FFFFFF';
    picker.dispatchEvent(new Event('input')); // Trigger the input event to update display
  });
  
  // Set all white sliders for RGBW channels
  const whiteSliders = document.querySelectorAll('#channelList .rgb-slider.white');
  whiteSliders.forEach(slider => {
    // If value is 0, set to 0, otherwise set to 255
    slider.value = value === 0 ? 0 : 255;
    slider.dispatchEvent(new Event('input')); // Trigger the input event to update display
    
    // Update the value display
    const valueSpan = slider.nextElementSibling;
    if (valueSpan) {
      valueSpan.textContent = slider.value;
    }
  });
  
  // Set all temperature sliders
  const tempSliders = document.querySelectorAll('#channelList .temp-slider');
  tempSliders.forEach(slider => {
    // If value is 0, set to warm (1800K), otherwise set to cool (6500K)
    slider.value = value === 0 ? 1800 : 6500;
    slider.dispatchEvent(new Event('input')); // Trigger the input event to update display
  });
}

/**
 * Nudges all level-based channel sliders by a specific percentage
 * @param {number} deltaPercent - The percentage to adjust by (positive or negative)
 */
function nudgeAllChannels(deltaPercent) {
  // Nudge all level-based channel sliders
  const sliders = document.querySelectorAll('#channelList .channel-slider');
  sliders.forEach(slider => {
    nudgeSlider(slider, deltaPercent);
  });
  
  // For temperature sliders, adjust by a proportional amount
  const tempSliders = document.querySelectorAll('#channelList .temp-slider');
  tempSliders.forEach(slider => {
    // Calculate the temperature range (6500 - 1800 = 4700)
    // and adjust by a proportional amount
    const tempRange = 4700;
    const tempDelta = Math.round((tempRange * deltaPercent) / 100);
    const currentTemp = parseInt(slider.value, 10);
    let newTemp = currentTemp + tempDelta;
    
    // Clamp to valid range
    if (newTemp < 1800) newTemp = 1800;
    if (newTemp > 6500) newTemp = 6500;
    
    slider.value = newTemp;
    slider.dispatchEvent(new Event('input')); // Trigger the input event to update display
  });
  
  // For white sliders in RGBW channels, nudge them like regular sliders
  const whiteSliders = document.querySelectorAll('#channelList .rgb-slider.white');
  whiteSliders.forEach(slider => {
    let currentValue = parseInt(slider.value, 10);
    let newValue = currentValue + Math.round((255 * deltaPercent) / 100);
    
    // Clamp to valid range
    if (newValue < 0) newValue = 0;
    if (newValue > 255) newValue = 255;
    
    slider.value = newValue;
    
    // Update the value display
    const valueSpan = slider.nextElementSibling;
    if (valueSpan) {
      valueSpan.textContent = slider.value;
    }
  });
  
  // For RGB color pickers, we don't nudge as it's not a linear scale
  // but we could implement brightness adjustment in the future if needed
}

// =============================================================================
// Window onload
// =============================================================================
window.onload = () => {
  console.log("DEBUG: UI Loaded - Fetching Settings...");
  window.electronAPI.requestSettings();
  
  // "Save" button: send $SCNSAVE, then wait 500ms, then close
  document.getElementById('modalSaveButton').addEventListener('click', () => {
    saveSceneAndClose();
  });
  
  // "Close" button: just close the modal
  document.getElementById('modalCloseButton').addEventListener('click', () => {
    closeSceneEditModal();
  });

  // "Send" button: send fade commands for all channels
  document.getElementById('modalSendButton').addEventListener('click', () => {
    sendSceneChannelLevels();
  });
  
  // Global control buttons
  document.getElementById('allOffButton').addEventListener('click', () => {
    setAllChannelsToValue(0); // 0% brightness
  });
  
  document.getElementById('allOnButton').addEventListener('click', () => {
    setAllChannelsToValue(255); // 100% brightness
  });
  
  document.getElementById('nudgeAllDownButton').addEventListener('click', () => {
    nudgeAllChannels(-5); // Decrease all by 5%
  });
  
  document.getElementById('nudgeAllUpButton').addEventListener('click', () => {
    nudgeAllChannels(5); // Increase all by 5%
  });
  
  // Demo for the channel fade slider in the Channel tab
  const channelLevel = document.getElementById('channel-level');
  const display = document.getElementById('channel-level-display');
  if (channelLevel && display) {
    channelLevel.addEventListener('input', function () {
      display.textContent = channelLevel.value;
    });
  }
};
