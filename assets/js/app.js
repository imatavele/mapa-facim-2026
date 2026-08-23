/* =========================================================
   FACIM NAVIGATOR
   Aplicação principal
   ========================================================= */

/* =========================================================
   CONFIGURAÇÃO
   ========================================================= */

const CONFIG = {
  data: {
    buildings: "data/edificios.geojson",
    parcels: "data/parcelas.geojson",
    wcs: "data/wcs.geojson",
    limit: "data/limite.geojson",
    parks: "data/parques.geojson",
    gates: "data/bilheteiras.geojson",
    services: "data/servicos.geojson",
  },

  map: {
    center: [-25.95, 32.58],
    zoom: 16,
  },

  search: {
    maxResults: 50,
  },
};

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

  buildingsLayer: null,

  parcelsLayer: null,

  wcsLayer: null,

  parksLayer: null,

  gatesLayer: null,

  servicesLayer: null,

  allFeatures: [],

  searchResults: [],

  selectedFeature: null,

  highlightedLayer: null,

  navigation: {
    active: false,

    limit: null,

    insideLimit: false,

    currentLocation: null,

    origin: null,

    destination: null,

    originLayer: null,

    destinationLayer: null,

    lineLayer: null,

    currentLocationLayer: null,

    watchId: null,

    previousLocation: null,

    navigationBox: null,

    currentLocationMarker: null,

    outsideLocationPopupTimer: null,
  },
};

/* =========================================================
   DIRECOES
   ========================================================= */

function showLiveNavigationBox() {
  const box = document.getElementById(
    "liveNavigationBox"
  );

  if (!box) {
    return;
  }

  box.classList.remove("hidden");

  state.navigation.navigationBox = box;

  const closeLiveNavigationButton =
    document.getElementById("closeLiveNavigation");

  if (closeLiveNavigationButton) {
    closeLiveNavigationButton.addEventListener(
      "click",
      hideLiveNavigationBox
    );
  }
}

function hideLiveNavigationBox() {
  const box = document.getElementById(
    "liveNavigationBox"
  );

  if (!box) {
    return;
  } else { console.log('liveNavigationBox nao encontrado'); }

  box.classList.add("hidden");

  state.navigation.navigationBox = null;
}

function updateLiveNavigation(position) {

  if (!state.navigation.destination) {
    return;
  }

  const currentPoint = turf.point([
    position.coords.longitude,
    position.coords.latitude,
  ]);

  const destination =
    state.navigation.destination.point;

  // Distância atual até ao destino
  const distanceMeters = turf.distance(
    currentPoint,
    destination,
    {
      units: "meters",
    }
  );

  // Verifica chegada
  if (
    distanceMeters <=
    NAVIGATION_ARRIVAL_DISTANCE
  ) {

    handleNavigationArrival(
      distanceMeters
    );

    return;
  }

  // Bearing da posição atual para o destino
  const destinationBearing =
    turf.bearing(
      currentPoint,
      destination
    );

  updateLiveNavigationDisplay(
    distanceMeters,
    destinationBearing,
    position
  );

  // Guarda posição atual
  state.navigation.currentLocation =
    currentPoint;
}

function handleNavigationArrival(distanceMeters) {

  const status =
    document.getElementById(
      "liveNavigationStatus"
    );

  const distance =
    document.getElementById(
      "liveNavigationDistance"
    );

  const direction =
    document.getElementById(
      "liveNavigationDirection"
    );

  if (distance) {
    distance.textContent =
      `${Math.round(distanceMeters)} m`;
  }

  if (direction) {
    direction.textContent = "🎯";
  }

  if (status) {

    status.textContent =
      "🎯 Chegaste ao destino";

    status.className =
      "live-navigation-status correct";
  }

  // Para o acompanhamento GPS
  stopNavigationTracking();
}

function formatNavigationDistance(
  distanceMeters
) {

  if (distanceMeters < 1000) {

    return `${Math.round(distanceMeters)} m`;

  }

  return `${(
    distanceMeters / 1000
  ).toFixed(2)} km`;
}

function bearingToDirection(bearing) {

  const normalized =
    ((bearing % 360) + 360) % 360;

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

function updateLiveNavigationDisplay(
  distanceMeters,
  bearing,
  position
) {

  const distanceElement =
    document.getElementById(
      "liveNavigationDistance"
    );

  const directionElement =
    document.getElementById(
      "liveNavigationDirection"
    );

  const statusElement =
    document.getElementById(
      "liveNavigationStatus"
    );

  if (
    !distanceElement ||
    !directionElement ||
    !statusElement
  ) {
    return;
  }

  distanceElement.textContent =
    formatNavigationDistance(
      distanceMeters
    );

  const direction =
    bearingToDirection(bearing);

  directionElement.textContent =
    `${formatDMS(bearing)} ${direction}`;

  updateNavigationMovementStatus(
    position,
    bearing,
    statusElement
  );
}

function updateNavigationMovementStatus(
  position,
  destinationBearing,
  statusElement
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

    movementBearing =
      position.coords.heading;
  }

  /*
   * 2. Se o GPS não fornecer heading,
   * calculamos pelo deslocamento.
   */
  else if (
    state.navigation.previousLocation
  ) {

    const previousLocation =
      state.navigation.previousLocation;

    const currentPoint = turf.point([
      position.coords.longitude,
      position.coords.latitude,
    ]);

    const movementDistance =
      turf.distance(
        previousLocation,
        currentPoint,
        {
          units: "meters",
        }
      );

    /*
     * Se praticamente não se moveu,
     * não tentamos determinar direção.
     */
    if (
      movementDistance >=
      NAVIGATION_MIN_MOVEMENT
    ) {

      movementBearing =
        turf.bearing(
          previousLocation,
          currentPoint
        );
    }
  }


  /*
   * Se não conseguimos determinar
   * a direção do movimento.
   */
  if (movementBearing === null) {

    statusElement.textContent =
      "A aguardar movimento...";

    statusElement.className =
      "live-navigation-status neutral";

    state.navigation.previousLocation =
      turf.point([
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
  const difference =
    angularDifference(
      movementBearing,
      destinationBearing
    );


  if (
    difference <=
    NAVIGATION_DIRECTION_TOLERANCE
  ) {

    statusElement.textContent =
      "✓ Está indo na direção certa";

    statusElement.className =
      "live-navigation-status correct";

  } else {

    statusElement.textContent =
      "↗ Está fora da direção do destino";

    statusElement.className =
      "live-navigation-status wrong";
  }


  /*
   * Guarda a posição para o próximo
   * cálculo de movimento.
   */
  state.navigation.previousLocation =
    turf.point([
      position.coords.longitude,
      position.coords.latitude,
    ]);
}

function angularDifference(
  a,
  b
) {

  let difference =
    Math.abs(a - b);

  if (difference > 180) {
    difference =
      360 - difference;
  }

  return difference;
}

function startNavigationTracking() {

  if (!navigator.geolocation) {

    showNavigationMessage(
      "Este dispositivo não disponibiliza localização.",
      5000
    );

    return;
  }

  // Evita dois observers simultâneos
  if (
    state.navigation.watchId !== null
  ) {

    navigator.geolocation.clearWatch(
      state.navigation.watchId
    );
  }

  state.navigation.previousLocation =
    null;


  state.navigation.watchId =
    navigator.geolocation.watchPosition(

      (position) => {

        const point = turf.point([
          position.coords.longitude,
          position.coords.latitude,
        ]);
        const firstLocation =
          !state.navigation.currentLocation;


        state.navigation.currentLocation =
          point;
        /*
     * Primeira posição recebida
     */
        if (firstLocation) {

          handleNavigationStartLocation();
        }

        updateLiveNavigation(
          position
        );

      },

      (error) => {

        console.error(
          "Navigation GPS:",
          error
        );

        const status =
          document.getElementById(
            "liveNavigationStatus"
          );

        if (status) {

          status.textContent =
            "Não foi possível atualizar a localização.";

          status.className =
            "live-navigation-status wrong";
        }
      },

      GEOLOCATION_OPTIONS
    );
}

function makeNavigationBoxDraggable() {

  const box =
    document.getElementById(
      "liveNavigationBox"
    );

  const header =
    box?.querySelector(
      ".live-navigation-header"
    );

  if (!box || !header) {
    return;
  }


  let dragging = false;

  let offsetX = 0;
  let offsetY = 0;


  header.addEventListener(
    "pointerdown",
    (event) => {

      dragging = true;

      const rect =
        box.getBoundingClientRect();

      offsetX =
        event.clientX - rect.left;

      offsetY =
        event.clientY - rect.top;

      header.setPointerCapture(
        event.pointerId
      );
    }
  );


  header.addEventListener(
    "pointermove",
    (event) => {

      if (!dragging) {
        return;
      }


      const app =
        document.getElementById(
          "app"
        );

      const appRect =
        app.getBoundingClientRect();


      let left =
        event.clientX -
        appRect.left -
        offsetX;

      let top =
        event.clientY -
        appRect.top -
        offsetY;


      // Não deixar sair completamente do mapa
      left = Math.max(
        0,
        Math.min(
          left,
          appRect.width -
          box.offsetWidth
        )
      );


      top = Math.max(
        0,
        Math.min(
          top,
          appRect.height -
          box.offsetHeight
        )
      );


      box.style.left =
        `${left}px`;

      box.style.top =
        `${top}px`;

      box.style.transform =
        "none";
    }
  );


  header.addEventListener(
    "pointerup",
    () => {

      dragging = false;
    }
  );


  header.addEventListener(
    "pointercancel",
    () => {

      dragging = false;
    }
  );
}

function stopNavigationTracking() {

  if (
    state.navigation.watchId !== null
  ) {

    navigator.geolocation.clearWatch(
      state.navigation.watchId
    );

    state.navigation.watchId =
      null;
  }

  state.navigation.previousLocation =
    null;

  state.navigation.currentLocation =
    null;
}

/* =========================================================
   INICIALIZAÇÃO
   ========================================================= */

function initializeApp() {
  initializeMap();
  initializeEvents();
  loadGeoJSONData();
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
   * EDIFÍCIOS
   * =====================================================
   */

  state.buildingsLayer = L.geoJSON(null, {
    style: {
      color: "#a765ad",

      weight: 1.5,

      fillColor: "rgba(37, 99, 235, 0.20)",

      fillOpacity: 0.35,
    },

    onEachFeature: handleBuildingFeature,
  }).addTo(state.map);

  /*
   * =====================================================
   * PARCELAS
   * =====================================================
   */

  state.parcelsLayer = L.geoJSON(null, {
    style: {
      color: "#f59e0b",

      weight: 1,

      fillColor: "rgba(245, 158, 11, 0.40)",

      fillOpacity: 0.12,
    },

    onEachFeature: handleParcelFeature,
  }).addTo(state.map);

  /*
   * =====================================================
   * WCs
   * =====================================================
   */

  state.wcsLayer = L.geoJSON(null, {
    style: {
      color: "#a855f7",

      weight: 1,

      fillColor: "rgba(168, 85, 247, 0.40)",

      fillOpacity: 0.12,
    },

    onEachFeature: handleWCFeature,
  }).addTo(state.map);

  /*
   * =====================================================
   * PARQUES
   * =====================================================
   */

  state.parksLayer = L.geoJSON(null, {
    style: {
      color: "#0ea5e9",

      weight: 1,

      fillColor: "rgba(14, 165, 233, 0.30)",

      fillOpacity: 0.12,
    },

    onEachFeature: handleParkFeature,
  }).addTo(state.map);

  /*
   * =====================================================
   * BILHETEIRAS
   * =====================================================
   */

  state.gatesLayer = L.geoJSON(null, {
    style: {
      color: "#ef4444",

      weight: 1,

      fillColor: "rgba(239, 68, 68, 0.30)",

      fillOpacity: 0.12,
    },

    onEachFeature: handleGateFeature,
  }).addTo(state.map);

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

function handleBuildingFeature(feature, layer) {
  layer.on({
    click: () => {
      selectFeature(feature, layer, "Edifício");
    },

    mouseover: () => {
      layer.setStyle({
        weight: 3,
        fillOpacity: 0.55,
      });
    },

    mouseout: () => {
      if (state.highlightedLayer !== layer) {
        state.buildingsLayer.resetStyle(layer);
      }
    },
  });
}

function handleParcelFeature(feature, layer) {
  layer.on({
    click: () => {
      selectFeature(feature, layer, "Stand");
    },

    mouseover: () => {
      layer.setStyle({
        weight: 3,
        fillOpacity: 0.25,
      });
    },

    mouseout: () => {
      if (state.highlightedLayer !== layer) {
        state.parcelsLayer.resetStyle(layer);
      }
    },
  });
}

function handleWCFeature(feature, layer) {
  layer.on({
    click: () => {
      selectFeature(feature, layer, "WC");
    },

    mouseover: () => {
      layer.setStyle({
        weight: 3,
        fillOpacity: 0.25,
      });
    },

    mouseout: () => {
      if (state.highlightedLayer !== layer) {
        state.wcsLayer.resetStyle(layer);
      }
    },
  });
}

function handleGateFeature(feature, layer) {
  layer.on({
    click: () => {
      selectFeature(feature, layer, "Bilheteira");
    },

    mouseover: () => {
      layer.setStyle({
        weight: 3,
        fillOpacity: 0.25,
      });
    },

    mouseout: () => {
      if (state.highlightedLayer !== layer) {
        state.gatesLayer.resetStyle(layer);
      }
    },
  });
}

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

function handleParkFeature(feature, layer) {
  layer.on({
    click: () => {
      selectFeature(feature, layer, "P. Estacionamento");
    },

    mouseover: () => {
      layer.setStyle({
        weight: 3,
        fillOpacity: 0.25,
      });
    },

    mouseout: () => {
      if (state.highlightedLayer !== layer) {
        state.parksLayer.resetStyle(layer);
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
    const [buildingsResponse, parcelsResponse, limitResponse, wcsResponse, gatesResponse, servicesResponse, parksResponse] =
      await Promise.all([
        fetch(CONFIG.data.buildings),

        fetch(CONFIG.data.parcels),

        fetch(CONFIG.data.limit),

        fetch(CONFIG.data.wcs),

        fetch(CONFIG.data.gates),

        fetch(CONFIG.data.services),

        fetch(CONFIG.data.parks),
      ]);

    if (!buildingsResponse.ok) {
      throw new Error("Não foi possível carregar edificios.geojson");
    }

    if (!parcelsResponse.ok) {
      throw new Error("Não foi possível carregar parcelas.geojson");
    }

    if (!limitResponse.ok) {
      throw new Error("Não foi possível carregar limite.geojson");
    }

    if (!wcsResponse.ok) {
      throw new Error("Não foi possível carregar wcs.geojson");
    }

    if (!gatesResponse.ok) {
      throw new Error("Não foi possível carregar gates.geojson");
    }

    if (!servicesResponse.ok) {
      throw new Error("Não foi possível carregar services.geojson");
    }

    if (!parksResponse.ok) {
      throw new Error("Não foi possível carregar parks.geojson");
    }

    const buildings = await buildingsResponse.json();

    const parcels = await parcelsResponse.json();

    const limit = await limitResponse.json();

    const wcs = await wcsResponse.json();

    const gates = await gatesResponse.json();

    const services = await servicesResponse.json();

    const parks = await parksResponse.json();

    state.navigation.limit = limit;

    /*
     * Adiciona os dados às camadas.
     */

    state.buildingsLayer.addData(buildings);

    state.parcelsLayer.addData(parcels);

    state.wcsLayer.addData(wcs);

    state.gatesLayer.addData(gates);

    state.servicesLayer.addData(services);

    state.parksLayer.addData(parks);

    /*
     * Registra todas as features
     * no índice de pesquisa.
     */

    registerFeatures(buildings, "Edifício", state.buildingsLayer);

    registerFeatures(parcels, "Stand", state.parcelsLayer);

    registerFeatures(wcs, "WC", state.wcsLayer);

    registerFeatures(gates, "Bilheteira", state.gatesLayer);

    registerFeatures(services, "Serviços", state.servicesLayer);

    registerFeatures(parks, "P. Estacionamento", state.parksLayer);

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

  if (state.buildingsLayer && state.buildingsLayer.getLayers().length) {
    layers.push(state.buildingsLayer);
  }

  if (state.parcelsLayer && state.parcelsLayer.getLayers().length) {
    layers.push(state.parcelsLayer);
  }

  if (state.wcsLayer && state.wcsLayer.getLayers().length) {
    layers.push(state.wcsLayer);
  }

  if (state.gatesLayer && state.gatesLayer.getLayers().length) {
    layers.push(state.gatesLayer);
  }

  if (state.servicesLayer && state.servicesLayer.getLayers().length) {
    layers.push(state.servicesLayer);
  }

  if (state.parksLayer && state.parksLayer.getLayers().length) {
    layers.push(state.parksLayer);
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

                ${detail
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
  console.log("properties", properties)
  const entries = Object.entries(properties);

  if (!entries.length) {
    return "";
  }

  return entries
    .filter(([key, value]) =>
      value !== null &&
      value !== undefined &&
      String(value).trim() !== ""
    )
    .slice(0, 3)
    .map(([key, value]) =>
      `${translateKey(key)}: ${value}`
    )
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
const visibleProps = ["code", "name", "description", "uso", "pavilhao", "expositor"];

function collapseLegend() {
  const collapsed = legendItems.classList.toggle("collapsed");

  toggleLegend.setAttribute(
    "aria-expanded",
    String(!collapsed)
  );

  toggleLegend.textContent = collapsed ? "↑" : "↓";

  toggleLegend.title = collapsed
    ? "Mostrar legenda"
    : "Ocultar legenda";
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

  toggleMapControls.setAttribute(
    "aria-expanded",
    String(!collapsed)
  );

  toggleMapControls.textContent = collapsed ? "☰" : "×";

  toggleMapControls.title = collapsed
    ? "Mostrar controles"
    : "Ocultar controles";
}

function initializeEvents() {

  const clearNavigationOrigin =
    document.getElementById("clearNavigationOrigin");

  const clearNavigationDestination =
    document.getElementById("clearNavigationDestination");

  const searchInput = document.getElementById("searchInput");

  const clearSearch = document.getElementById("clearSearch");

  const searchResults = document.getElementById("searchResults");

  const toggleMapControls = document.getElementById("toggleMapControls");

  const mapControlsItems = document.getElementById("mapControlsItems");

  const showOutsideLocationButton =
    document.getElementById(
      "showOutsideLocation"
    );

  if (showOutsideLocationButton) {

    showOutsideLocationButton.addEventListener(
      "click",
      showOutsideLocation
    );
  }


  const closeOutsideLocationButton =
    document.getElementById(
      "closeOutsideLocation"
    );

  if (closeOutsideLocationButton) {

    closeOutsideLocationButton.addEventListener(
      "click",
      closeOutsideNavigationPopup
    );
  }

  if (clearNavigationOrigin) {
    clearNavigationOrigin.addEventListener("click", () => {

      document.getElementById(
        "navigationOriginSearch"
      ).value = "";

      state.navigation.origin = null;

      document.getElementById(
        "navigationOriginResults"
      ).innerHTML = "";
    });
  }

  if (clearNavigationDestination) {
    clearNavigationDestination.addEventListener("click", () => {

      document.getElementById(
        "navigationDestinationSearch"
      ).value = "";

      state.navigation.destination = null;

      document.getElementById(
        "navigationDestinationResults"
      ).innerHTML = "";
    });
  }

  toggleMapControls?.addEventListener("click", collapseMapControls);

  //Controlo da legenda
  const toggleLegend = document.getElementById("toggleLegend");
  const legendItems = document.getElementById("legendItems");

  toggleLegend?.addEventListener("click", collapseLegend);

  /*
   * Pesquisa.
   */

  searchInput?.addEventListener("input", (event) => {
    const query = event.target.value.trim();

    if (!query) {
      clearSearch.classList.add("hidden");

      searchResults.classList.add("hidden");

      return;
    }

    clearSearch.classList.remove("hidden");

    const results = searchFeatures(query);

    state.searchResults = results;

    renderSearchResults(results);
  });

  /*
   * Limpar pesquisa.
   */

  clearSearch?.addEventListener("click", () => {
    searchInput.value = "";

    clearSearch.classList.add("hidden");

    searchResults.classList.add("hidden");

    searchInput.focus();
  });

  /*
   * Fechar painel de informação.
   */

  document.getElementById("closeFeatureInfo").addEventListener("click", () => {
    document.getElementById("featureInfo").classList.add("hidden");

    clearHighlight();
  });

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

  /*
   * Localização do utilizador.
   */

  document.getElementById("locateButton").addEventListener("click", locateUser);

  /*
   * Fecha resultados ao clicar
   * fora da pesquisa.
   */

  document.addEventListener("click", (event) => {
    const searchContainer = document.querySelector(".search-container");

    if (!searchContainer.contains(event.target)) {
      searchResults.classList.add("hidden");
    }
  });

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
   * Edifícios
   */

  document
    .getElementById("buildingsToggle")
    .addEventListener("change", (event) => {
      toggleLayer(state.buildingsLayer, event.target.checked);
    });

  /*
   * Parcelas
   */

  document
    .getElementById("parcelsToggle")
    .addEventListener("change", (event) => {
      toggleLayer(state.parcelsLayer, event.target.checked);
    });

  /*
 * WCs
 */
  document
    .getElementById("wcsToggle")
    .addEventListener("change", (event) => {
      toggleLayer(state.wcsLayer, event.target.checked);
    });

  /*
   * Bilheteiras
   */
  document
    .getElementById("gatesToggle")
    .addEventListener("change", (event) => {
      toggleLayer(state.gatesLayer, event.target.checked);
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
   * Parques
   */
  document
    .getElementById("parkingToggle")
    .addEventListener("change", (event) => {
      toggleLayer(state.parksLayer, event.target.checked);
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

  document
    .getElementById("navigationButton")
    .addEventListener("click", openNavigation);

  document
    .getElementById("useCurrentLocation")
    .addEventListener("click", useCurrentLocationAsOrigin);

  document
    .getElementById("startNavigation")
    .addEventListener("click", startNavigation);

  document
    .getElementById("exitNavigation")
    .addEventListener("click", exitNavigation);

  document
    .getElementById("navigationOriginSearch")
    .addEventListener("input", (event) => {
      searchNavigationOrigin(event.target.value);
    });

  document
    .getElementById("navigationDestinationSearch")
    .addEventListener("input", (event) => {
      renderNavigationSearchResults(event.target.value, "destination");
    });

  document
    .getElementById("toggleNavigationForm")
    .addEventListener("click", toggleNavigationForm);

  makeNavigationBoxDraggable();
}

function toggleNavigationForm() {
  const panel = document.getElementById("navigationPanel");
  const button = document.getElementById("toggleNavigationForm");

  const collapsed = panel.classList.toggle("collapsed");

  button.setAttribute(
    "aria-expanded",
    String(!collapsed)
  );

  button.textContent = collapsed ? "▶" : "◀";

  button.title = collapsed
    ? "Mostrar navegação"
    : "Recolher";
}

function validateNavigation() {
  if (!state.navigation.origin) {
    showNavigationMessage("Selecione uma origem.", 3000);

    return false;
  }

  if (!state.navigation.destination) {
    showNavigationMessage("Selecione um destino.", 3000);

    return false;
  }

  return true;
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

function searchNavigationOrigin(query) {
  renderNavigationSearchResults(query, "origin");
}

function renderNavigationSearchResults(query, mode) {
  const resultsContainer = document.getElementById(
    mode === "origin"
      ? "navigationOriginResults"
      : "navigationDestinationResults",
  );

  resultsContainer.innerHTML = "";

  const normalizedQuery = query.trim().toLowerCase();

  if (!normalizedQuery) {
    return;
  }

  const results = getNavigationItems()
    .filter((item) => featureMatchesSearch(item.feature, query))
    .slice(0, 10);

  results.forEach((item) => {
    const button = document.createElement("button");

    button.type = "button";

    button.className = "navigation-search-result";

    let html = `
                <span>
                    ${getNavigationTypeLabel(item.type)}
                </span>

                <strong>
                    ${escapeHTML(item.title)}
                </strong>
            `;

    button.innerHTML = html;

    button.addEventListener("click", () => {

      const inputId =
        mode === "origin"
          ? "navigationOriginSearch"
          : "navigationDestinationSearch";

      selectNavigationItem(item, mode);

      resultsContainer.innerHTML = "";
    });

    resultsContainer.appendChild(button);
  });
}

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

function azimuthToBearing(azimuth) {
  azimuth = ((azimuth % 360) + 360) % 360;

  if (azimuth >= 0 && azimuth < 90) {
    return {
      quadrant: "N",
      direction: "E",
      angle: azimuth,
    };
  }

  if (azimuth >= 90 && azimuth < 180) {
    return {
      quadrant: "S",
      direction: "E",
      angle: 180 - azimuth,
    };
  }

  if (azimuth >= 180 && azimuth < 270) {
    return {
      quadrant: "S",
      direction: "W",
      angle: azimuth - 180,
    };
  }

  return {
    quadrant: "N",
    direction: "W",
    angle: 360 - azimuth,
  };
}

function formatBearing(azimuth) {
  const bearing = azimuthToBearing(azimuth);

  return (
    `${bearing.quadrant} ` +
    `${formatDMS(bearing.angle)} ` +
    `${bearing.direction}`
  );
}

function getNavigationTypeLabel(type) {
  if (type === "building") {
    return "Edifício";
  }

  if (type === "parcel") {
    return "Stand";
  }

  return type;
}

function selectNavigationItem(item, mode) {
  const point = getNavigationCenter(item.feature);

  if (!point) {
    return;
  }

  if (mode === "origin") {
    state.navigation.origin = {
      point,

      feature: item.feature,

      title: item.title,

      type: item.type,
    };

    document.getElementById("navigationOriginSearch").value = getNavigationTypeLabel(item.type) + ' ' + item.title;

    document.getElementById("navigationOriginResults").innerHTML = "";
  }

  if (mode === "destination") {
    state.navigation.destination = {
      point,

      feature: item.feature,

      title: item.title,

      type: item.type,
    };

    document.getElementById("navigationDestinationSearch").value = getNavigationTypeLabel(item.type) + ' ' + item.title;

    document.getElementById("navigationDestinationResults").innerHTML = "";
  }
}

async function openNavigation() {
  const panel = document.getElementById("navigationPanel");

  panel.classList.remove("hidden");
  panel.classList.remove("collapsed");

  state.navigation.active = true;

  requestCurrentLocation(true);
}

async function determineNavigationOrigin() {
  const status = document.getElementById("navigationStatus");

  status.textContent = "A obter a tua localização...";

  if (!navigator.geolocation) {
    state.navigation.insideLimit = false;

    setOriginRequired();

    status.textContent =
      "Não foi possível usar a localização. " +
      "Selecione obrigatoriamente uma origem.";

    return;
  }

  navigator.geolocation.getCurrentPosition(
    (position) => {
      const lng = position.coords.longitude;

      const lat = position.coords.latitude;

      const point = turf.point([lng, lat]);

      const inside = isPointInsideLimit(point);

      state.navigation.insideLimit = inside;

      if (inside) {
        setCurrentLocationOrigin(point);

        status.textContent =
          "Está dentro da área da FACIM. " +
          "A localização atual foi definida como origem. " +
          "Pode alterá-la se desejar.";
      } else {
        setOriginRequired();

        status.textContent =
          "Está fora da área da FACIM. " +
          "Selecione obrigatoriamente uma origem.";
      }
    },

    () => {
      state.navigation.insideLimit = false;

      setOriginRequired();

      status.textContent =
        "Não foi possível obter a localização. " +
        "Selecione obrigatoriamente uma origem.";
    },

    GEOLOCATION_OPTIONS
  );
}

function isPointInsideLimit(point) {

  if (!state.navigation.limit) {
    return false;
  }

  try {
    const limit = state.navigation.limit;

    const limitFeature =
      limit.type === "FeatureCollection"
        ? limit.features[0]
        : limit;
    return turf.booleanPointInPolygon(point, limitFeature);
  } catch (error) {
    console.error("Erro ao verificar limite:", error);

    return false;
  }
}

function setCurrentLocationOrigin(point) {
  state.navigation.origin = {
    type: "current",

    point,
  };

  const select = document.getElementById("navigationOrigin");

  select.innerHTML = `

        <option value="current">
            Minha localização atual
        </option>

    `;

  select.value = "current";
}

function setOriginRequired() {
  state.navigation.origin = null;

  const select = document.getElementById("navigationOrigin");

  select.innerHTML = `

        <option value="">
            Selecionar origem
        </option>

    `;

  populateNavigationFeatures(select, true);
}

function populateNavigationDestinations() {
  const input = document.getElementById("navigationDestinationSearch");

  if (!input) {
    return;
  }

  input.value = "";

  document.getElementById("navigationDestinationResults").innerHTML = "";
}

function populateNavigationFeatures(select, origin) {
  state.allFeatures.forEach((item, index) => {
    const option = document.createElement("option");

    option.value = `${item.type}:${index}`;

    option.textContent = getFeatureTitle(item.feature, item.type, index);

    select.appendChild(option);
  });
}

function setNavigationStatus(message) {
  const status = document.getElementById("navigationStatus");

  if (!status) return;

  status.textContent = message;
}

function showNavigationMessage(message, duration = 3000) {
  const status = document.getElementById("navigationStatus");

  if (!status) return;

  status.textContent = message;

  clearTimeout(status._timeout);

  status._timeout = setTimeout(() => {
    status.textContent = "";
  }, duration);
}

function requestCurrentLocation(useAsOrigin = false) {
  if (!navigator.geolocation) {
    showNavigationMessage("Este dispositivo não disponibiliza localização.", 3000);

    return;
  }

  setNavigationStatus("A obter a localização atual...");

  navigator.geolocation.getCurrentPosition(
    (position) => {
      const point = turf.point([
        position.coords.longitude,

        position.coords.latitude,
      ]);

      state.navigation.currentLocation = point;

      if (useAsOrigin) {
        state.navigation.origin = {
          point,

          feature: null,

          title: "Minha localização atual",

          type: "current",
        };

        document.getElementById("navigationOriginSearch").value =
          "Minha localização atual";
      }

      checkNavigationLocation(point);
    },

    (error) => {
      console.error("Geolocation:", error);

      setNavigationStatus(
        "Não foi possível obter a localização. " +
        "Selecione uma origem manualmente.",
      );

      state.navigation.insideLimit = false;
    },

    GEOLOCATION_OPTIONS,
  );
}

function checkNavigationLocation(point) {
  const inside = isPointInsideLimit(point);

  state.navigation.insideLimit = inside;

  if (inside) {
    /*
     * O utilizador está dentro da FACIM.
     * A localização GPS passa a ser
     * a origem padrão.
     */

    state.navigation.origin = {
      point: point,

      feature: null,

      title: "Minha localização atual",

      type: "current",
    };

    document.getElementById("navigationOriginSearch").value =
      "Minha localização atual";

    setNavigationStatus(
      "Está dentro da área da FACIM. " +
      "A localização atual foi definida como origem. " +
      "Pode alterá-la se desejar.",
    );
  } else {
    /*
     * Fora da FACIM:
     * GPS não pode ser origem automática.
     */

    state.navigation.origin = null;

    document.getElementById("navigationOriginSearch").value = "";

    setNavigationStatus(
      "Sua localização actual está fora do recinto da FACIM. " + "Selecione obrigatoriamente uma origem.",
    );
  }
}

function handleNavigationStartLocation() {

  const point =
    state.navigation.currentLocation;

  if (!point) {
    return;
  }

  const inside =
    isPointInsideLimit(point);

  state.navigation.insideLimit =
    inside;


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

function useCurrentLocationAsOrigin() {
  if (!state.navigation.currentLocation) {
    requestCurrentLocation(true);

    return;
  }

  state.navigation.origin = {
    point: state.navigation.currentLocation,

    feature: null,

    title: "Minha localização atual",

    type: "current",
  };

  document.getElementById("navigationOriginSearch").value =
    "Minha localização atual";

  document.getElementById("navigationOriginResults").innerHTML = "";
}

function startNavigation() {

  if (!validateNavigation()) {
    return;
  }

  const origin = state.navigation.origin.point;

  const destination =
    state.navigation.destination.point;

  // Desenha a navegação existente
  drawNavigation(
    origin,
    destination
  );

  // Recolhe o painel de configuração
  const panel =
    document.getElementById(
      "navigationPanel"
    );

  if (panel) {
    panel.classList.add("collapsed");
  }

  const toggle =
    document.getElementById(
      "toggleNavigationForm"
    );

  if (toggle) {
    toggle.textContent = "▶";
  }

  // NOVO:
  // Mostra a caixa de navegação em tempo real
  showLiveNavigationBox();

  // NOVO:
  // Começa a acompanhar a posição GPS
  startNavigationTracking();
}

function getNavigationFeature(value) {
  const separator = value.indexOf(":");

  if (separator === -1) {
    return null;
  }

  const index = Number(value.substring(separator + 1));

  return state.allFeatures[index]?.feature || null;
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

function featureMatchesSearch(feature, query) {
  const properties = feature.properties || {};

  const searchableText = Object.values(properties)
    .map((value) => String(value ?? ""))
    .join(" ")
    .toLowerCase();

  return searchableText.includes(query.trim().toLowerCase());
}

function drawNavigation(origin, destination) {
  clearNavigationGraphics();

  /*
   * Coordenadas
   */

  const originCoords = origin.geometry.coordinates;

  const destinationCoords = destination.geometry.coordinates;

  /*
   * Linha
   */

  const line = turf.lineString([originCoords, destinationCoords]);

  /*
   * Desenha linha no mapa
   */

  state.navigation.lineLayer = L.geoJSON(line, {
    style: {
      color: "#dc2626",

      weight: 4,

      opacity: 0.9,

      dashArray: "10 7",
    },
  }).addTo(state.map);

  /*
   * Origem
   */

  state.navigation.originLayer = L.circleMarker(toLatLng(origin), {
    radius: 9,

    color: "#2563eb",

    weight: 3,

    fillColor: "#2563eb",

    fillOpacity: 0.9,
  })
    .addTo(state.map)
    .bindPopup(`<strong>Origem</strong><br><br>${document.getElementById("navigationOriginSearch")?.value}`);

  /*
   * Destino
   */

  state.navigation.destinationLayer = L.circleMarker(toLatLng(destination), {
    radius: 9,

    color: "#dc2626",

    weight: 3,

    fillColor: "#dc2626",

    fillOpacity: 0.9,
  })
    .addTo(state.map)
    .bindPopup(`<strong>Destino</strong><br><br>${document.getElementById("navigationDestinationSearch")?.value}`);

  /*
   * Enquadrar
   */

  const bounds = L.latLngBounds([toLatLng(origin), toLatLng(destination)]);

  state.map.fitBounds(bounds, {
    padding: [100, 100],
  });

  /*
   * Cálculos
   */

  calculateNavigation(origin, destination);

  /*
   * Resultado visível
   */

  document.getElementById("navigationResult").classList.remove("hidden");
  document.getElementById("navigationOriginName").textContent =
    state.navigation.origin.title;

  document.getElementById("navigationDestinationName").textContent =
    state.navigation.destination.title;
}

function toLatLng(point) {
  const [lng, lat] = point.geometry.coordinates;

  return [lat, lng];
}

function calculateNavigation(origin, destination) {
  /*
   * Distância geodésica
   */

  const distanceKm = turf.distance(origin, destination, {
    units: "kilometers",
  });

  const distanceMeters = distanceKm * 1000;

  let distanceText;

  if (distanceMeters < 1000) {
    distanceText = `${Math.round(distanceMeters)} m`;
  } else {
    distanceText = `${distanceKm.toFixed(2)} km`;
  }

  document.getElementById("navigationDistance").textContent = distanceText;

  const azimuth = calculateAzimuth(origin, destination);

  document.getElementById("navigationAzimuth").textContent = formatDMS(azimuth);

  document.getElementById("navigationBearing").textContent =
    formatBearing(azimuth);
}

function calculateAzimuth(origin, destination) {
  const bearing = turf.bearing(origin, destination);

  return (bearing + 360) % 360;
}

function bearingToRumo(azimuth) {
  azimuth = (azimuth + 360) % 360;

  if (azimuth >= 0 && azimuth < 90) {
    return `N ${azimuth.toFixed(1)}° E`;
  }

  if (azimuth >= 90 && azimuth < 180) {
    return `S ${(180 - azimuth).toFixed(1)}° E`;
  }

  if (azimuth >= 180 && azimuth < 270) {
    return `S ${(azimuth - 180).toFixed(1)}° W`;
  }

  return `N ${(360 - azimuth).toFixed(1)}° W`;
}

function clearNavigationGraphics() {
  const navigationLayers = [
    state.navigation.originLayer,

    state.navigation.destinationLayer,

    state.navigation.lineLayer,

    state.navigation.currentLocationLayer,
  ];

  navigationLayers.forEach((layer) => {
    if (layer && state.map.hasLayer(layer)) {
      state.map.removeLayer(layer);
    }
  });

  state.navigation.originLayer = null;

  state.navigation.destinationLayer = null;

  state.navigation.lineLayer = null;

  state.navigation.currentLocationLayer = null;
}

function exitNavigation() {
  /*
   * 1. Remover elementos gráficos
   */
  clearNavigationGraphics();

  /*
   * 2. Fechar caixa de navegação em tempo real
   */
  hideLiveNavigationBox();

  /*
   * 3. Remover localização do utilizador
   */
  clearCurrentLocation();

  /*
   * 4. Limpar estado da navegação
   */

  state.navigation.active = false;

  state.navigation.origin = null;

  state.navigation.destination = null;

  state.navigation.currentLocation = null;

  state.navigation.insideLimit = false;

  /*
   * 3. Limpar campo de origem
   */

  const originInput = document.getElementById("navigationOriginSearch");

  if (originInput) {
    originInput.value = "";
  }

  /*
   * 4. Limpar campo de destino
   */

  const destinationInput = document.getElementById(
    "navigationDestinationSearch",
  );

  if (destinationInput) {
    destinationInput.value = "";
  }

  /*
   * 5. Limpar resultados da pesquisa
   */

  const originResults = document.getElementById("navigationOriginResults");

  if (originResults) {
    originResults.innerHTML = "";
  }

  const destinationResults = document.getElementById(
    "navigationDestinationResults",
  );

  if (destinationResults) {
    destinationResults.innerHTML = "";
  }

  /*
   * 6. Limpar resultados da navegação
   */

  const navigationResult = document.getElementById("navigationResult");

  if (navigationResult) {
    navigationResult.classList.add("hidden");
  }

  /*
   * 7. Limpar valores das métricas
   */

  const distance = document.getElementById("navigationDistance");

  if (distance) {
    distance.textContent = "—";
  }

  const azimuth = document.getElementById("navigationAzimuth");

  if (azimuth) {
    azimuth.textContent = "—";
  }

  const bearing = document.getElementById("navigationBearing");

  if (bearing) {
    bearing.textContent = "—";
  }

  /*
   * 8. Limpar nomes
   */

  const originName = document.getElementById("navigationOriginName");

  if (originName) {
    originName.textContent = "—";
  }

  const destinationName = document.getElementById("navigationDestinationName");

  if (destinationName) {
    destinationName.textContent = "—";
  }

  /*
   * 9. Mostrar novamente o painel
   */

  const navigationPanel = document.getElementById("navigationPanel");

  if (navigationPanel) {
    navigationPanel.classList.remove("collapsed");
  }

  const toggleButton = document.getElementById("toggleNavigationForm");

  if (toggleButton) {
    toggleButton.textContent = "◀";
    toggleButton.setAttribute("aria-expanded", "true");
  }
  stopNavigationTracking();

  fitNavigationLimit();
}

function fitNavigationLimit() {

  const limit = state.navigation.limit;

  if (!limit) {
    return;
  }

  try {

    const layer = L.geoJSON(limit);

    const bounds = layer.getBounds();

    if (!bounds.isValid()) {
      return;
    }

    state.map.flyTo(
      [-25.772372919351948, 32.63568462891243],
      17,
      {
        duration: 1.5,
      }
    );
    toggleNavigationForm();

  } catch (error) {
    console.error(
      "Erro ao enquadrar limite da FACIM:",
      error
    );
  }
}

function closeNavigation() {
  document.getElementById("navigationPanel").classList.add("hidden");
}

/* =========================================================
   LOCALIZAÇÃO DO UTILIZADOR
   ========================================================= */

function showOutsideNavigationPopup() {

  const popup =
    document.getElementById(
      "outsideNavigationPopup"
    );

  if (!popup) {
    return;
  }

  // Cancela temporizador anterior
  if (
    state.navigation.outsideLocationPopupTimer
  ) {

    clearTimeout(
      state.navigation.outsideLocationPopupTimer
    );
  }

  popup.classList.remove("hidden");

  state.navigation.outsideLocationPopupTimer =
    setTimeout(() => {

      closeOutsideNavigationPopup();

    }, 10000);
}

function closeOutsideNavigationPopup() {

  const popup =
    document.getElementById(
      "outsideNavigationPopup"
    );

  if (popup) {
    popup.classList.add("hidden");
  }

  if (
    state.navigation.outsideLocationPopupTimer
  ) {

    clearTimeout(
      state.navigation.outsideLocationPopupTimer
    );

    state.navigation.outsideLocationPopupTimer =
      null;
  }
}

function showOutsideLocation() {

  const point =
    state.navigation.currentLocation;

  if (!point) {
    return;
  }

  // Fecha imediatamente o popup
  closeOutsideNavigationPopup();

  // Renderiza localização
  renderCurrentLocation(point);

  const [lng, lat] =
    point.geometry.coordinates;

  const locationLatLng =
    L.latLng(lat, lng);


  /*
   * Bounds da FACIM
   */
  const limit =
    state.navigation.limit;

  if (!limit) {
    state.map.setView(
      locationLatLng,
      state.map.getZoom()
    );

    return;
  }


  /*
   * Bounds do limite da FACIM
   */
  const limitFeature =
    limit.type === "FeatureCollection"
      ? limit.features[0]
      : limit;


  const limitLayer =
    L.geoJSON(limitFeature);


  const limitBounds =
    limitLayer.getBounds();


  /*
   * Junta:
   *
   * FACIM + localização atual
   */
  const bounds =
    limitBounds.extend(
      locationLatLng
    );

  state.map.fitBounds(
    bounds,
    {
      padding: [40, 40],
      maxZoom: 18,
    }
  );

  collapseLegend();

  collapseMapControls();
}


function clearCurrentLocation() {

  const marker =
    state.navigation.currentLocationMarker;

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

    state.navigation.currentLocationMarker.setLatLng([
      lat,
      lng
    ]);

    return;
  }

  const marker = L.circleMarker(
    [lat, lng],
    {
      radius: 8,
      color: "#2563eb",
      weight: 3,
      fillColor: "#3b82f6",
      fillOpacity: 0.8,
    }
  ).addTo(state.map);

  marker.bindTooltip(
    "Minha localização",
    {
      direction: "top",
    }
  );

  state.navigation.currentLocationMarker =
    marker;
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
        "Verifica se o dispositivo tem localização disponível."
      );
    } else if (error.code === 3) {
      showError(
        "A localização demorou demasiado tempo. " +
        "Tenta novamente."
      );
    } else {
      showError("Não foi possível obter a tua localização.");
    }
  });
}

/* =========================================================
   ESCONDER RESULTADOS
   ========================================================= */

function hideSearchResults() {
  document.getElementById("searchResults").classList.add("hidden");
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
