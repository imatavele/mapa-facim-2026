/* =========================================================
   FACIM NAVIGATOR
   Aplicação principal
   ========================================================= */

/* =========================================================
   CONFIGURAÇÃO
   ========================================================= */

const CONFIG = {
  data: {
    services: "data/prm.geojson",
    limit: "../data/limite.geojson",
  },

  map: {
    center: [-25.95, 32.58],
    zoom: 14,
  },

  search: {
    maxResults: 50,
  },
  
};

function decimalToDMS(decimal) {
  decimal = ((decimal % 360) + 360) % 360;

  const degrees = Math.floor(decimal);

  const minutesDecimal = (decimal - degrees) * 60;

  const minutes = Math.floor(minutesDecimal);

  const seconds = (minutesDecimal - minutes) * 60;

  return {
    degrees,
    minutes,
    seconds,
  };
}

function formatDMS(decimal) {
  const dms = decimalToDMS(decimal);

  return `${dms.degrees}° ` + `${dms.minutes}' ` + `${dms.seconds.toFixed(2)}"`;
}

const GEOLOCATION_OPTIONS = {
  enableHighAccuracy: true,
  timeout: 20000,
  maximumAge: 60000,
};

const NAVIGATION_ARRIVAL_DISTANCE = 5; // metros
const NAVIGATION_DIRECTION_TOLERANCE = 35; // graus
const NAVIGATION_MIN_MOVEMENT = 2; // metros

/* =========================================================
   ESTADO DA APLICAÇÃO
   ========================================================= */

const state = {
  map: null,

  currentBasemap: null,

  basemaps: {},

  servicesLayer: null,

  serviceFeatures: null,

  allFeatures: [],

  selectedFeature: null,

  highlightedLayer: null,

  navigation: {
    active: false,

    limit: null,

    currentLocation: null,

    currentLocationLayer: null,

    currentLocationMarker: null,
  },
};

/* =========================================================
   INICIALIZAÇÃO
   ========================================================= */

async function initializeApp() {
  initializeMap();
  initializeEvents();
  loadGeoJSONData();
  //await getUserLocation();
  //handleNavigationStartLocation();
}

function handleNavigationStartLocation() {
  const point = state.navigation.currentLocation;

  if (!point) {
    showError(
      "Não foi possível obter a sua localização atual. Certifique de permitir a aplicação obter sua localização",
    );
    return;
  }

  const inside = isPointInsideLimit(point);

  state.navigation.insideLimit = inside;

  if (inside) {
    /*
     * Dentro da FACIM:
     * mostra automaticamente.
     */
    renderCurrentLocation(point);

    return;
  }

  /*
   * Fora da FACIM:
   * não mostra automaticamente.
   * Pergunta primeiro.
   */
  showOutsideNavigationPopup();
}

function isPointInsideLimit(point) {
  if (!state.navigation.limit) {
    return false;
  }

  try {
    const limit = state.navigation.limit;

    const limitFeature =
      limit.type === "FeatureCollection" ? limit.features[0] : limit;
    return turf.booleanPointInPolygon(point, limitFeature);
  } catch (error) {
    console.error("Erro ao verificar limite:", error);

    return false;
  }
}

/* =========================================================
   MAPA
   ========================================================= */

function initializeMap() {
  state.map = L.map("map", {
    zoomControl: false,

    attributionControl: true,
  });

  /*
   * =====================================================
   * BASEMAPS
   * =====================================================
   */

  state.basemaps = {
    osm: L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 22,

      attribution: "&copy; OpenStreetMap contributors",
    }),

    cartoLight: L.tileLayer(
      "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png",
      {
        maxZoom: 22,

        attribution: "&copy; OpenStreetMap &copy; CARTO",
      },
    ),

    cartoDark: L.tileLayer(
      "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png",
      {
        maxZoom: 22,

        attribution: "&copy; OpenStreetMap &copy; CARTO",
      },
    ),

    satellite: L.tileLayer(
      "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
      {
        maxZoom: 22,

        attribution: "Tiles &copy; Esri",
      },
    ),
  };

  /*
   * Basemap inicial
   */

  state.currentBasemap = state.basemaps.osm;

  state.currentBasemap.addTo(state.map);

  /*
   * Posição inicial
   */

  state.map.setView(CONFIG.map.center, CONFIG.map.zoom);

  /*
   * =====================================================
   * SERVICOS
   * =====================================================
   */

  state.servicesLayer = L.geoJSON(null, {
    style: {
      color: "#8b5cf6",

      weight: 1,

      fillColor: "rgba(139, 92, 246, 0.25)",

      fillOpacity: 0.12,
    },

    onEachFeature: handleServiceFeature,
  }).addTo(state.map);
}

/* =========================================================
   EVENTOS DO MAPA
   ========================================================= */

function handleServiceFeature(feature, layer) {
  layer.on({
    click: () => {
      selectFeature(feature, layer, "Serviços");
    },

    mouseover: () => {
      layer.setStyle({
        weight: 3,
        fillOpacity: 0.25,
      });
    },

    mouseout: () => {
      if (state.highlightedLayer !== layer) {
        state.servicesLayer.resetStyle(layer);
      }
    },
  });
}

/* =========================================================
   CARREGAMENTO DOS GEOJSON
   ========================================================= */

async function loadGeoJSONData() {
  showLoading(true);

  hideError();

  try {
    const [limitResponse, servicesResponse] = await Promise.all([
      fetch(CONFIG.data.limit),

      fetch(CONFIG.data.services),
    ]);

    if (!limitResponse.ok) {
      throw new Error("Não foi possível carregar limite.geojson");
    }

    if (!servicesResponse.ok) {
      throw new Error("Não foi possível carregar services.geojson");
    }

    const limit = await limitResponse.json();

    const services = await servicesResponse.json();

    state.navigation.limit = limit;

    /*
     * Adiciona os dados às camadas.
     */
    state.serviceFeatures = services;
    state.servicesLayer.addData(services);

    /*
     * Registra todas as features
     * no índice de pesquisa.
     */

    registerFeatures(services, "Serviços", state.servicesLayer);

    /*
     * Ajusta o mapa para mostrar
     * todos os dados.
     */

    fitMapToData();
  } catch (error) {
    console.error("Erro ao carregar dados:", error);

    showError(
      "Não foi possível carregar os dados do mapa. " +
        "Verifique se os arquivos GeoJSON estão em /data/.",
    );
  } finally {
    showLoading(false);
  }
}

/* =========================================================
   REGISTRO DAS FEATURES
   ========================================================= */

function registerFeatures(geojson, type, layer) {
  if (!geojson || !Array.isArray(geojson.features)) {
    return;
  }

  geojson.features.forEach((feature, index) => {
    state.allFeatures.push({
      feature,

      type,

      layer,

      index,
    });
  });
}

/* =========================================================
   AJUSTAR MAPA AOS DADOS
   ========================================================= */

function fitMapToData() {
  const layers = [];

  if (state.servicesLayer && state.servicesLayer.getLayers().length) {
    layers.push(state.servicesLayer);
  }

  if (!layers.length) {
    return;
  }

  const group = L.featureGroup(layers);

  try {
    state.map.fitBounds(group.getBounds(), {
      padding: [30, 30],
    });
  } catch (error) {
    console.warn("Não foi possível ajustar o mapa.", error);
  }
}

/* =========================================================
   PESQUISA
   ========================================================= */

function searchFeatures(query) {
  const normalizedQuery = normalizeText(query);

  if (!normalizedQuery) {
    return [];
  }

  const results = [];

  for (const item of state.allFeatures) {
    const properties = item.feature.properties || {};

    /*
     * Pesquisa em TODOS os campos.
     */

    const searchableText = Object.entries(properties)
      .map(([key, value]) => {
        return `${key} ${value}`;
      })
      .join(" ");
    const normalizedText = normalizeText(searchableText);

    if (normalizedText.includes(normalizedQuery)) {
      results.push(item);
    }

    if (results.length >= CONFIG.search.maxResults) {
      break;
    }
  }

  return results;
}

/* =========================================================
   NORMALIZAÇÃO DO TEXTO
   ========================================================= */

function normalizeText(value) {
  return String(value ?? "")
    .normalize("NFD")

    .replace(/[\u0300-\u036f]/g, "")

    .toLowerCase()

    .trim();
}

/* =========================================================
   MOSTRAR RESULTADOS
   ========================================================= */

function renderSearchResults(results) {
  const container = document.getElementById("searchResults");

  container.innerHTML = "";

  if (!results.length) {
    container.innerHTML = `
            <div class="no-results">
                Nenhum local encontrado.
            </div>
        `;

    container.classList.remove("hidden");

    return;
  }

  results.forEach((item, index) => {
    const element = document.createElement("div");

    element.className = "search-result";

    const title = "Classe"; //getFeatureTitle(item.feature, item.type, index);

    const detail = getFeatureDescription(item.feature);

    element.innerHTML = `

                <div class="result-title">
                    ${escapeHTML(title)}
                </div>

                <div class="result-type">
                    ${escapeHTML(item.type)}
                </div>

                ${
                  detail
                    ? `
                    <div class="result-detail">
                        ${escapeHTML(detail)}
                    </div>
                    `
                    : ""
                }

            `;

    element.addEventListener("click", () => {
      focusFeature(item);

      hideSearchResults();
    });

    container.appendChild(element);
  });

  container.classList.remove("hidden");
}

/* =========================================================
   TÍTULO DA FEATURE
   ========================================================= */

function getFeatureTitle(feature, type, index) {
  const properties = feature.properties || {};

  /*
   * Campos preferenciais.
   *
   * Se o teu GeoJSON tiver, por exemplo:
   *
   * nome
   * name
   * designacao
   * id
   * codigo
   *
   * tentamos utilizá-los primeiro.
   */

  const preferredFields = [
    "nome",

    "name",

    "designacao",

    "designação",

    "descricao",

    "descrição",

    "codigo",

    "uso",

    "código",

    "id",

    "fid",

    "code",

    "expositor",

    "pavilhao",
  ];

  for (const field of preferredFields) {
    if (
      properties[field] !== undefined &&
      properties[field] !== null &&
      String(properties[field]).trim()
    ) {
      return String(properties[field]);
    }
  }

  /*
   * Caso nenhum campo conhecido
   * exista, utiliza o primeiro valor.
   */

  const entries = Object.entries(properties);

  if (entries.length) {
    return String(entries[0][1]);
  }

  return `${type} ${index + 1}`;
}

/* =========================================================
   DESCRIÇÃO DA FEATURE
   ========================================================= */

function getFeatureDescription(feature) {
  const properties = feature.properties || {};
  console.log("properties", properties);
  const entries = Object.entries(properties);

  if (!entries.length) {
    return "";
  }

  return entries
    .filter(
      ([key, value]) =>
        value !== null && value !== undefined && String(value).trim() !== "",
    )
    .slice(0, 3)
    .map(([key, value]) => `${translateKey(key)}: ${value}`)
    .join(" • ");
}

/* =========================================================
   FOCAR FEATURE
   ========================================================= */

function focusFeature(item) {
  const feature = item.feature;

  const layer = findLayerForFeature(item);

  if (!layer) {
    return;
  }

  /*
   * Remove destaque anterior.
   */

  clearHighlight();

  /*
   * Destaca a feature selecionada.
   */

  if (typeof layer.setStyle === "function") {
    layer.setStyle({
      weight: 4,

      fillOpacity: 0.65,
    });

    state.highlightedLayer = layer;
  }

  /*
   * Tenta obter os limites
   * da geometria.
   */

  try {
    const bounds = layer.getBounds();

    if (bounds && bounds.isValid()) {
      state.map.fitBounds(bounds, {
        padding: [80, 80],

        maxZoom: 20,
      });
    }
  } catch (error) {
    console.warn("Não foi possível enquadrar a feature.", error);
  }

  /*
   * Mostra a informação.
   */

  selectFeature(feature, layer, item.type);
}

/* =========================================================
   LOCALIZAR LAYER
   ========================================================= */

function findLayerForFeature(item) {
  const collection = item.layer;

  if (!collection) {
    return null;
  }

  const layers = collection.getLayers();

  /*
   * Encontramos a feature comparando
   * o objeto GeoJSON.
   */

  return layers.find((layer) => layer.feature === item.feature) || null;
}

/* =========================================================
   SELECIONAR FEATURE
   ========================================================= */

function selectFeature(feature, layer, type) {
  state.selectedFeature = {
    feature,
    layer,
    type,
  };

  /*
   * Popup no mapa.
   */

  const popup = createPopupContent(feature, type);

  layer.bindPopup(popup).openPopup();

  /*
   * Painel inferior.
   */

  showFeatureInfo(feature, type);
}

/* =========================================================
   POPUP
   ========================================================= */
const visibleProps = [
  "code",
  "name",
  "description",
  "uso",
  "pavilhao",
  "expositor",
];

function collapseLegend() {
  const collapsed = legendItems.classList.toggle("collapsed");

  toggleLegend.setAttribute("aria-expanded", String(!collapsed));

  toggleLegend.textContent = collapsed ? "↑" : "↓";

  toggleLegend.title = collapsed ? "Mostrar legenda" : "Ocultar legenda";
}

function createPopupContent(feature, type) {
  const properties = feature.properties || {};

  const title = "Classe"; //getFeatureTitle(feature, type, 0);

  let html = `

        <div class="facim-popup-title">
            ${escapeHTML(title)}
        </div>

        <div class="facim-popup-type">
            ${escapeHTML(type)}
        </div>

    `;

  Object.entries(properties)
    .slice(0, 8)
    .forEach(([key, value]) => {
      if (visibleProps.includes(key)) {
        html += `

                    <div>
                        <strong>
                            ${escapeHTML(translateKey(key))}
                        </strong>:

                        ${escapeHTML(value)}
                    </div>

                `;
      }
    });

  return html;
}

function translateKey(key) {
  switch (key.toLowerCase()) {
    case "name":
      return "Designação";
    case "description":
      return "Descrição";
    case "code":
      return "Número";
    default:
      return ucfirst(key);
  }
}

function ucfirst(str) {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

/* =========================================================
   PAINEL DE INFORMAÇÃO
   ========================================================= */

function showFeatureInfo(feature, type) {
  const container = document.getElementById("featureInfo");

  const content = document.getElementById("featureInfoContent");

  const properties = feature.properties || {};

  const title = "Detalhes"; //getFeatureTitle(feature, type, 0);

  let html = `

        <h3 class="feature-title">
            ${escapeHTML(title)}
        </h3>

    `;

  html += `

        <div class="feature-row">

            <span class="feature-key">
                Tipo
            </span>

            <span class="feature-value">
                ${escapeHTML(type)}
            </span>

        </div>

    `;

  Object.entries(properties).forEach(([key, value]) => {
    if (visibleProps.includes(key)) {
      html += `

                        <div class="feature-row">

                            <span class="feature-key">
                                ${escapeHTML(translateKey(key))}
                            </span>

                            <span class="feature-value">
                                ${escapeHTML(value)}
                            </span>

                        </div>

                    `;
    }
  });

  content.innerHTML = html;

  container.classList.remove("hidden");
}

/* =========================================================
   LIMPAR DESTAQUE
   ========================================================= */

function clearHighlight() {
  if (!state.highlightedLayer) {
    return;
  }

  const layer = state.highlightedLayer;

  /*
   * Descobre a qual camada pertence.
   */

  if (state.buildingsLayer.hasLayer(layer)) {
    state.buildingsLayer.resetStyle(layer);
  }

  if (state.parcelsLayer.hasLayer(layer)) {
    state.parcelsLayer.resetStyle(layer);
  }

  state.highlightedLayer = null;
}

/* =========================================================
   EVENTOS DA INTERFACE
   ========================================================= */

function collapseMapControls() {
  const collapsed = mapControlsItems.classList.toggle("collapsed");

  toggleMapControls.setAttribute("aria-expanded", String(!collapsed));

  toggleMapControls.textContent = collapsed ? "☰" : "×";

  toggleMapControls.title = collapsed
    ? "Mostrar controles"
    : "Ocultar controles";
}

function initializeEvents() {
  const toggleMapControls = document.getElementById("toggleMapControls");

  const mapControlsItems = document.getElementById("mapControlsItems");

  toggleMapControls?.addEventListener("click", collapseMapControls);

  //Controlo da legenda
  const toggleLegend = document.getElementById("toggleLegend");
  const legendItems = document.getElementById("legendItems");

  toggleLegend?.addEventListener("click", collapseLegend);

  document.getElementById("closeFeatureInfo").addEventListener("click", () => {
    document.getElementById("featureInfo").classList.add("hidden");

    clearHighlight();
  });

  const showOutsideLocationButton = document.getElementById(
    "showOutsideLocation",
  );

  if (showOutsideLocationButton) {
    showOutsideLocationButton.addEventListener("click", showOutsideLocation);
  }

  // Mostra a caixa de navegação em tempo real
  showLiveNavigationBox();

  // NOVO:
  // Começa a acompanhar a posição GPS

  /*
   * Zoom +
   */

  document.getElementById("zoomInButton").addEventListener("click", () => {
    state.map.zoomIn();
  });

  /*
   * Zoom -
   */

  document.getElementById("zoomOutButton").addEventListener("click", () => {
    state.map.zoomOut();
  });

  makeNavigationBoxDraggable();

  /*
   * Localização do utilizador.
   */

  document.getElementById("locateButton").addEventListener("click", locateUser);

  /*
   * =====================================================
   * PAINEL DE MAPAS E CAMADAS
   * =====================================================
   */

  const layersButton = document.getElementById("layersButton");

  const layersPanel = document.getElementById("layersPanel");

  /*
   * Abrir / fechar painel
   */

  layersButton.addEventListener("click", (event) => {
    event.stopPropagation();

    layersPanel.classList.toggle("hidden");
  });

  /*
   * Trocar basemap
   */

  document.querySelectorAll('input[name="basemap"]').forEach((radio) => {
    radio.addEventListener("change", (event) => {
      changeBasemap(event.target.value);
    });
  });

  /*
   * Servicos
   */
  document
    .getElementById("servicesToggle")
    .addEventListener("change", (event) => {
      toggleLayer(state.servicesLayer, event.target.checked);
    });

  /*
   * Não fechar o painel quando
   * clicar dentro dele.
   */

  layersPanel.addEventListener("click", (event) => {
    event.stopPropagation();
  });

  /*
   * Clicar fora fecha o painel.
   */

  document.addEventListener("click", (event) => {
    if (!event.target.closest(".map-layers-control")) {
      layersPanel.classList.add("hidden");
    }
  });

  startNavigationTracking();
}

/* =========================================================
   DIRECOES
   ========================================================= */

function showLiveNavigationBox() {
  const box = document.getElementById("liveNavigationBox");

  if (!box) {
    return;
  }

  box.classList.remove("hidden");

  state.navigation.navigationBox = box;

  const closeLiveNavigationButton = document.getElementById(
    "closeLiveNavigation",
  );

  if (closeLiveNavigationButton) {
    closeLiveNavigationButton.addEventListener("click", hideLiveNavigationBox);
  }
}

function hideLiveNavigationBox() {
  const box = document.getElementById("liveNavigationBox");

  if (!box) {
    return;
  } else {
    console.log("liveNavigationBox nao encontrado");
  }

  box.classList.add("hidden");

  state.navigation.navigationBox = null;
}

function getNavigationCenter(featureOrPoint) {
  try {
    if (
      featureOrPoint &&
      featureOrPoint.type === "Feature" &&
      featureOrPoint.geometry &&
      featureOrPoint.geometry.type === "Point"
    ) {
      return featureOrPoint;
    }

    return turf.centroid(featureOrPoint);
  } catch (error) {
    console.error("Erro ao calcular centro:", error);

    return null;
  }
}

function updateLiveNavigation(position) {
  if (!state.serviceFeatures || state.serviceFeatures.features.length == 0) {
    return;
  }
  const feature = state.serviceFeatures.features[0];

  const point = getNavigationCenter(feature);

  state.navigation.destination = {
      point,

      feature: feature,

      title: feature.properties.uso,

      type: feature.type,
    };
  
  if (!state.navigation.destination) {
    return;
  }

  const currentPoint = turf.point([
    position.coords.longitude,
    position.coords.latitude,
  ]);

  const destination = state.navigation.destination.point;

  // Distância atual até ao destino
  const distanceMeters = turf.distance(currentPoint, destination, {
    units: "meters",
  });

  // Verifica chegada
  if (distanceMeters <= NAVIGATION_ARRIVAL_DISTANCE) {
    handleNavigationArrival(distanceMeters);

    return;
  }

  // Bearing da posição atual para o destino
  const destinationBearing = turf.bearing(currentPoint, destination);

  updateLiveNavigationDisplay(distanceMeters, destinationBearing, position);

  // Guarda posição atual
  state.navigation.currentLocation = currentPoint;
}

function handleNavigationArrival(distanceMeters) {
  const status = document.getElementById("liveNavigationStatus");

  const distance = document.getElementById("liveNavigationDistance");

  const direction = document.getElementById("liveNavigationDirection");

  if (distance) {
    distance.textContent = `${Math.round(distanceMeters)} m`;
  }

  if (direction) {
    direction.textContent = "🎯";
  }

  if (status) {
    status.textContent = "🎯 Chegaste ao destino";

    status.className = "live-navigation-status correct";
  }

  // Para o acompanhamento GPS
  stopNavigationTracking();
}

function formatNavigationDistance(distanceMeters) {
  if (distanceMeters < 1000) {
    return `${Math.round(distanceMeters)} m`;
  }

  return `${(distanceMeters / 1000).toFixed(2)} km`;
}

function bearingToDirection(bearing) {
  const normalized = ((bearing % 360) + 360) % 360;

  if (normalized === 0) {
    return "N";
  }

  if (normalized < 90) {
    return "NE";
  }

  if (normalized === 90) {
    return "E";
  }

  if (normalized < 180) {
    return "SE";
  }

  if (normalized === 180) {
    return "S";
  }

  if (normalized < 270) {
    return "SW";
  }

  if (normalized === 270) {
    return "W";
  }

  return "NW";
}

function updateLiveNavigationDisplay(distanceMeters, bearing, position) {
  const distanceElement = document.getElementById("liveNavigationDistance");

  const directionElement = document.getElementById("liveNavigationDirection");

  const statusElement = document.getElementById("liveNavigationStatus");

  if (!distanceElement || !directionElement || !statusElement) {
    return;
  }

  distanceElement.textContent = formatNavigationDistance(distanceMeters);

  const direction = bearingToDirection(bearing);

  directionElement.textContent = `${formatDMS(bearing)} ${direction}`;

  updateNavigationMovementStatus(position, bearing, statusElement);
}

function updateNavigationMovementStatus(
  position,
  destinationBearing,
  statusElement,
) {
  let movementBearing = null;

  /*
   * 1. Primeiro tentamos usar o heading
   * fornecido pelo GPS.
   */
  if (
    typeof position.coords.heading === "number" &&
    !Number.isNaN(position.coords.heading)
  ) {
    movementBearing = position.coords.heading;
  } else if (state.navigation.previousLocation) {
    /*
     * 2. Se o GPS não fornecer heading,
     * calculamos pelo deslocamento.
     */
    const previousLocation = state.navigation.previousLocation;

    const currentPoint = turf.point([
      position.coords.longitude,
      position.coords.latitude,
    ]);

    const movementDistance = turf.distance(previousLocation, currentPoint, {
      units: "meters",
    });

    /*
     * Se praticamente não se moveu,
     * não tentamos determinar direção.
     */
    if (movementDistance >= NAVIGATION_MIN_MOVEMENT) {
      movementBearing = turf.bearing(previousLocation, currentPoint);
    }
  }

  /*
   * Se não conseguimos determinar
   * a direção do movimento.
   */
  if (movementBearing === null) {
    statusElement.textContent = "A aguardar movimento...";

    statusElement.className = "live-navigation-status neutral";

    state.navigation.previousLocation = turf.point([
      position.coords.longitude,
      position.coords.latitude,
    ]);

    return;
  }

  /*
   * Diferença entre:
   *
   * direção em que o utilizador vai
   * +
   * direção em que deveria ir.
   */
  const difference = angularDifference(movementBearing, destinationBearing);

  if (difference <= NAVIGATION_DIRECTION_TOLERANCE) {
    statusElement.textContent = "✓ Está indo na direção certa";

    statusElement.className = "live-navigation-status correct";
  } else {
    statusElement.textContent = "↗ Está fora da direção do destino";

    statusElement.className = "live-navigation-status wrong";
  }

  /*
   * Guarda a posição para o próximo
   * cálculo de movimento.
   */
  state.navigation.previousLocation = turf.point([
    position.coords.longitude,
    position.coords.latitude,
  ]);
}

function angularDifference(a, b) {
  let difference = Math.abs(a - b);

  if (difference > 180) {
    difference = 360 - difference;
  }

  return difference;
}

function startNavigationTracking() {
  if (!navigator.geolocation) {
    showNavigationMessage(
      "Este dispositivo não disponibiliza localização.",
      5000,
    );

    return;
  }

  // Evita dois observers simultâneos
  if (state.navigation.watchId !== null) {
    navigator.geolocation.clearWatch(state.navigation.watchId);
  }

  state.navigation.previousLocation = null;

  state.navigation.watchId = navigator.geolocation.watchPosition(
    (position) => {
      const point = turf.point([
        position.coords.longitude,
        position.coords.latitude,
      ]);
      const firstLocation = !state.navigation.currentLocation;

      state.navigation.currentLocation = point;
      /*
       * Primeira posição recebida
       */
      if (firstLocation) {
        handleNavigationStartLocation();
      }

      updateLiveNavigation(position);
    },

    (error) => {
      console.error("Navigation GPS:", error);

      const status = document.getElementById("liveNavigationStatus");

      if (status) {
        status.textContent = "Não foi possível atualizar a localização.";

        status.className = "live-navigation-status wrong";
      }
    },

    GEOLOCATION_OPTIONS,
  );
}

function makeNavigationBoxDraggable() {
  const box = document.getElementById("liveNavigationBox");

  const header = box?.querySelector(".live-navigation-header");

  if (!box || !header) {
    return;
  }

  let dragging = false;

  let offsetX = 0;
  let offsetY = 0;

  header.addEventListener("pointerdown", (event) => {
    dragging = true;

    const rect = box.getBoundingClientRect();

    offsetX = event.clientX - rect.left;

    offsetY = event.clientY - rect.top;

    header.setPointerCapture(event.pointerId);
  });

  header.addEventListener("pointermove", (event) => {
    if (!dragging) {
      return;
    }

    const app = document.getElementById("app");

    const appRect = app.getBoundingClientRect();

    let left = event.clientX - appRect.left - offsetX;

    let top = event.clientY - appRect.top - offsetY;

    // Não deixar sair completamente do mapa
    left = Math.max(0, Math.min(left, appRect.width - box.offsetWidth));

    top = Math.max(0, Math.min(top, appRect.height - box.offsetHeight));

    box.style.left = `${left}px`;

    box.style.top = `${top}px`;

    box.style.transform = "none";
  });

  header.addEventListener("pointerup", () => {
    dragging = false;
  });

  header.addEventListener("pointercancel", () => {
    dragging = false;
  });
}

function stopNavigationTracking() {
  if (state.navigation.watchId !== null) {
    navigator.geolocation.clearWatch(state.navigation.watchId);

    state.navigation.watchId = null;
  }

  state.navigation.previousLocation = null;

  state.navigation.currentLocation = null;
}

/* =========================================================
   NAVEGAÇÃO DO UTILIZADOR
   ========================================================= */
function getNavigationItems() {
  return state.allFeatures.map((item, index) => {
    return {
      index,

      type: item.type,

      feature: item.feature,

      title: getFeatureTitle(item.feature, item.type, index),
    };
  });
}

/* =========================================================
   LOCALIZAÇÃO DO UTILIZADOR
   ========================================================= */
function showOutsideNavigationPopup() {
  const popup = document.getElementById("outsideNavigationPopup");

  if (!popup) {
    return;
  }

  // Cancela temporizador anterior
  if (state.navigation.outsideLocationPopupTimer) {
    clearTimeout(state.navigation.outsideLocationPopupTimer);
  }

  popup.classList.remove("hidden");

  state.navigation.outsideLocationPopupTimer = setTimeout(() => {
    closeOutsideNavigationPopup();
  }, 10000);
}

function closeOutsideNavigationPopup() {
  const popup = document.getElementById("outsideNavigationPopup");

  if (popup) {
    popup.classList.add("hidden");
  }

  if (state.navigation.outsideLocationPopupTimer) {
    clearTimeout(state.navigation.outsideLocationPopupTimer);

    state.navigation.outsideLocationPopupTimer = null;
  }
}

function showOutsideLocation() {
  const point = state.navigation.currentLocation;

  if (!point) {
    return;
  }

  // Fecha imediatamente o popup
  closeOutsideNavigationPopup();

  // Renderiza localização
  renderCurrentLocation(point);

  const [lng, lat] = point.geometry.coordinates;

  const locationLatLng = L.latLng(lat, lng);

  /*
   * Bounds da FACIM
   */
  const limit = state.navigation.limit;

  if (!limit) {
    state.map.setView(locationLatLng, state.map.getZoom());

    return;
  }

  /*
   * Bounds do limite da FACIM
   */
  const limitFeature =
    limit.type === "FeatureCollection" ? limit.features[0] : limit;

  const limitLayer = L.geoJSON(limitFeature);

  const limitBounds = limitLayer.getBounds();

  /*
   * Junta:
   *
   * FACIM + localização atual
   */
  const bounds = limitBounds.extend(locationLatLng);

  state.map.fitBounds(bounds, {
    padding: [40, 40],
    maxZoom: 18,
  });

  collapseLegend();

  collapseMapControls();
}

function clearCurrentLocation() {
  const marker = state.navigation.currentLocationMarker;

  if (!marker) {
    return;
  }

  state.map.removeLayer(marker);

  state.navigation.currentLocationMarker = null;
}

function renderCurrentLocation(point) {
  if (!point) {
    return;
  }

  const [lng, lat] = point.geometry.coordinates;

  // Se já existe, apenas atualiza
  if (state.navigation.currentLocationMarker) {
    state.navigation.currentLocationMarker.setLatLng([lat, lng]);

    return;
  }

  const marker = L.circleMarker([lat, lng], {
    radius: 8,
    color: "#2563eb",
    weight: 3,
    fillColor: "#3b82f6",
    fillOpacity: 0.8,
  }).addTo(state.map);

  marker.bindTooltip("Minha localização", {
    direction: "top",
  });

  state.navigation.currentLocationMarker = marker;
}

function getUserLocation() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      showError("O teu navegador não suporta geolocalização.");
      reject(new Error("Geolocalização não suportada."));
      return;
    }

    state.map.locate({
      setView: true,
      maxZoom: 19,
      ...GEOLOCATION_OPTIONS,
    });

    state.map.once("locationfound", (event) => {
      const currentPoint = turf.point([event.latlng.lng, event.latlng.lat]);

      state.navigation.currentLocation = currentPoint;

      resolve(currentPoint);
    });

    state.map.once("locationerror", (error) => {
      console.error("❌ Erro de geolocalização:", error);
      console.error("Código:", error.code);
      console.error("Mensagem:", error.message);

      if (error.code === 1) {
        showError("Permissão de localização recusada.");
      } else if (error.code === 2) {
        showError(
          "Não foi possível determinar a tua localização. " +
            "Verifica se o dispositivo tem localização disponível.",
        );
      } else if (error.code === 3) {
        showError(
          "A localização demorou demasiado tempo. " + "Tenta novamente.",
        );
      } else {
        showError("Não foi possível obter a tua localização.");
      }

      reject(error);
    });
  });
}

function locateUser() {
  if (!navigator.geolocation) {
    showError("O teu navegador não suporta geolocalização.");

    return;
  }

  state.map.locate({
    setView: true,

    maxZoom: 19,

    ...GEOLOCATION_OPTIONS,
  });

  state.map.once("locationfound", (event) => {
    L.circleMarker(event.latlng, {
      radius: 8,

      weight: 3,

      fillOpacity: 0.8,
    })
      .addTo(state.map)
      .bindPopup("A tua localização")
      .openPopup();
  });

  state.map.once("locationerror", (error) => {
    console.error("❌ Erro de geolocalização:", error);
    console.error("Código:", error.code);
    console.error("Mensagem:", error.message);

    if (error.code === 1) {
      showError("Permissão de localização recusada.");
    } else if (error.code === 2) {
      showError(
        "Não foi possível determinar a tua localização. " +
          "Verifica se o dispositivo tem localização disponível.",
      );
    } else if (error.code === 3) {
      showError("A localização demorou demasiado tempo. " + "Tenta novamente.");
    } else {
      showError("Não foi possível obter a tua localização.");
    }
  });
}

/* =========================================================
   LOADING
   ========================================================= */

function showLoading(show) {
  const loading = document.getElementById("loading");

  loading.classList.toggle("hidden", !show);
}

/* =========================================================
   ERRO
   ========================================================= */

function showError(message) {
  const element = document.getElementById("errorMessage");

  element.textContent = message;

  element.classList.remove("hidden");

  setTimeout(() => {
    element.classList.add("hidden");
  }, 5000);
}

function hideError() {
  document.getElementById("errorMessage").classList.add("hidden");
}

/* =========================================================
   SEGURANÇA HTML
   ========================================================= */

function escapeHTML(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

/* =========================================================
   TROCAR BASEMAP
   ========================================================= */

function changeBasemap(name) {
  const newBasemap = state.basemaps[name];

  if (!newBasemap) {
    console.warn("Basemap não encontrado:", name);

    return;
  }

  /*
   * Remove o mapa atual.
   */

  if (state.currentBasemap) {
    state.map.removeLayer(state.currentBasemap);
  }

  /*
   * Adiciona o novo.
   */

  newBasemap.addTo(state.map);

  /*
   * Atualiza estado.
   */

  state.currentBasemap = newBasemap;
}

/* =========================================================
   ATIVAR / DESATIVAR CAMADA
   ========================================================= */

function toggleLayer(layer, visible) {
  if (!layer) {
    return;
  }

  if (visible) {
    if (!state.map.hasLayer(layer)) {
      layer.addTo(state.map);
    }
  } else {
    if (state.map.hasLayer(layer)) {
      state.map.removeLayer(layer);
    }
  }
}

export { initializeApp };
