const fundingData = [
  {
    title: "국민대학교 로고 후리스",
    price: "39,000원",
    image: "https://picsum.photos/seed/fleece1/300/300",
    badge: "마감임박",
    badgeType: "urgent",
    logo: "KMU",
    progress: 85,
  },
  {
    title: "국민대학교 로고 과잠",
    price: "52,000원",
    image: "https://picsum.photos/seed/jacket1/300/300",
    badge: "마감임박",
    badgeType: "urgent",
    logo: "KMU",
    progress: 72,
  },
  {
    title: "컴공 MT 버스 대절",
    price: "15,000원",
    image: "https://picsum.photos/seed/bus1/300/300",
    badge: "모집중",
    badgeType: "open",
    logo: "CS",
    progress: 45,
  },
  {
    title: "국민대 롱패딩 공구",
    price: "68,000원",
    image: "https://picsum.photos/seed/padding1/300/300",
    badge: "모집중",
    badgeType: "open",
    logo: "KMU",
    progress: 30,
  },
];

function renderFundingCards() {
  const container = document.getElementById("fundingCards");
  container.innerHTML = fundingData
    .map(
      (item) => `
    <div class="funding-card">
      <div class="card-thumb">
        <img src="${item.image}" alt="${item.title}">
        <span class="card-badge ${item.badgeType}">${item.badge}</span>
        <span class="card-logo">${item.logo}</span>
      </div>
      <div class="card-title">${item.title}</div>
      <div class="card-price">${item.price}</div>
      <div class="progress-bar">
        <div class="progress-fill" style="width: ${item.progress}%"></div>
      </div>
      <div class="progress-text">${item.progress}% 달성</div>
    </div>
  `
    )
    .join("");
}

renderFundingCards();
