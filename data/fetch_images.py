#!/usr/bin/env python3
"""
Fetch placeholder images for each location type using Exa API.
Categorizes locations and finds representative images.
"""

import json
import os
import re
import requests
from pathlib import Path
from dotenv import load_dotenv

# Load API key
load_dotenv()
EXA_API_KEY = os.getenv("EXA_API_KEY")
if not EXA_API_KEY:
    # Try parsing the .env file manually
    env_path = Path(__file__).parent / ".env"
    if env_path.exists():
        content = env_path.read_text()
        match = re.search(r'EXA_API_KEY\s*=\s*([^\s]+)', content)
        if match:
            EXA_API_KEY = match.group(1).strip()

if not EXA_API_KEY:
    raise ValueError("EXA_API_KEY not found in environment or .env file")

# Location type definitions based on characteristics
LOCATION_TYPES = {
    "cafe": {
        "keywords": ["cafe", "coffee", "cà phê", "quán", "tiệm"],
        "search_query": "cozy vietnamese coffee shop cafe interior aesthetic",
        "characteristics": ["không gian", "decor", "check-in", "thoáng mát", "yên tĩnh"]
    },
    "restaurant": {
        "keywords": ["quán ăn", "nhà hàng", "cơm", "phở", "bún", "mì", "hủ tiếu", "bánh"],
        "search_query": "vietnamese restaurant food interior Ho Chi Minh City",
        "characteristics": ["món ăn", "đồ ăn", "ngon", "tươi", "đậm đà"]
    },
    "tea_shop": {
        "keywords": ["trà", "tea", "trà sữa"],
        "search_query": "bubble tea shop boba tea store aesthetic",
        "characteristics": ["trà sữa", "trà", "đậm trà"]
    },
    "seafood": {
        "keywords": ["ốc", "hải sản", "cua", "tôm", "cá"],
        "search_query": "vietnamese seafood restaurant shellfish dishes",
        "characteristics": ["ốc", "hải sản", "cua", "tôm", "tươi sống"]
    },
    "korean": {
        "keywords": ["korean", "hàn", "bbq", "korean bbq", "mì cay", "champong"],
        "search_query": "korean restaurant bbq seoul food interior",
        "characteristics": ["hàn quốc", "nướng", "mì cay", "kim chi"]
    },
    "japanese": {
        "keywords": ["sushi", "udon", "nhật", "japan", "sashimi", "ramen"],
        "search_query": "japanese restaurant sushi udon interior aesthetic",
        "characteristics": ["nhật", "sushi", "sashimi", "udon"]
    },
    "street_food": {
        "keywords": ["bình dân", "vỉa hè", "ăn vặt", "chè", "bánh mì"],
        "search_query": "vietnamese street food stall vendor ho chi minh",
        "characteristics": ["bình dân", "giá rẻ", "sinh viên", "vỉa hè"]
    },
    "shopping_mall": {
        "keywords": ["mall", "mart", "plaza", "trung tâm thương mại", "lotte"],
        "search_query": "shopping mall interior vietnam modern",
        "characteristics": ["trung tâm", "đa dạng", "mua sắm"]
    },
    "amusement_park": {
        "keywords": ["công viên", "park", "khu vui chơi", "trò chơi", "game"],
        "search_query": "amusement park water park vietnam entertainment",
        "characteristics": ["vui chơi", "trò chơi", "công viên", "trượt"]
    },
    "cultural_center": {
        "keywords": ["văn hóa", "cultural", "bưu điện", "post office", "landmark"],
        "search_query": "ho chi minh city landmark cultural heritage building",
        "characteristics": ["kiến trúc", "lịch sử", "văn hóa", "triển lãm"]
    },
    "school": {
        "keywords": ["school", "trường", "đại học", "university", "high school"],
        "search_query": "vietnam university campus school building",
        "characteristics": ["trường", "sân", "tòa nhà"]
    },
    "steak_house": {
        "keywords": ["steak", "bò", "beef", "bít tết", "nướng"],
        "search_query": "steakhouse beef restaurant grilled meat interior",
        "characteristics": ["bò", "nướng", "steak", "bít tết"]
    },
    "ice_cream": {
        "keywords": ["gelato", "kem", "ice cream"],
        "search_query": "gelato ice cream shop aesthetic interior",
        "characteristics": ["kem", "gelato"]
    },
    "farm_park": {
        "keywords": ["farm", "nông trại", "thú cưng", "eco"],
        "search_query": "eco farm park animals children play area vietnam",
        "characteristics": ["nông trại", "cây xanh", "thú", "không gian xanh"]
    },
    "hotpot": {
        "keywords": ["lẩu", "hotpot", "nồi"],
        "search_query": "vietnamese hotpot restaurant lau interior",
        "characteristics": ["lẩu", "nồi", "nước lèo"]
    },
    "pizza": {
        "keywords": ["pizza"],
        "search_query": "pizza restaurant italian food aesthetic interior",
        "characteristics": ["pizza", "thủ công"]
    },
    "cruise": {
        "keywords": ["cruise", "du thuyền", "sông"],
        "search_query": "saigon river cruise boat dinner vietnam",
        "characteristics": ["sông", "view", "du thuyền", "cruise"]
    },
    "arcade": {
        "keywords": ["arcade", "máy gắp", "game center"],
        "search_query": "arcade game center claw machine entertainment",
        "characteristics": ["máy gắp", "trò chơi"]
    }
}


def classify_location(poi_name: str, characteristic: str) -> str:
    """Classify a location based on its name and characteristics."""
    poi_lower = poi_name.lower()
    char_lower = characteristic.lower() if characteristic else ""
    combined = f"{poi_lower} {char_lower}"
    
    # Priority order for classification
    priority_types = [
        "cruise", "amusement_park", "farm_park", "arcade", "shopping_mall",
        "cultural_center", "school", "ice_cream", "pizza",
        "korean", "japanese", "seafood", "hotpot", "steak_house",
        "tea_shop", "street_food", "cafe", "restaurant"
    ]
    
    for loc_type in priority_types:
        config = LOCATION_TYPES[loc_type]
        # Check keywords in POI name
        for keyword in config["keywords"]:
            if keyword in poi_lower:
                return loc_type
        # Check characteristics
        for char_keyword in config.get("characteristics", []):
            if char_keyword in char_lower and any(kw in combined for kw in config["keywords"]):
                return loc_type
    
    # Additional heuristics
    if "coffee" in combined or "cà phê" in combined or "cafe" in combined:
        return "cafe"
    if any(food in combined for food in ["cơm", "phở", "bún", "mì", "bánh canh"]):
        return "restaurant"
    if "trà sữa" in combined:
        return "tea_shop"
    if "ốc" in combined or "hải sản" in combined:
        return "seafood"
    
    # Default to restaurant for food-related, cafe for others
    if any(word in char_lower for word in ["món", "ngon", "ăn", "thực đơn", "menu"]):
        return "restaurant"
    if any(word in char_lower for word in ["không gian", "decor", "check-in"]):
        return "cafe"
    
    return "restaurant"  # Default


def search_exa_for_image(query: str, loc_type: str) -> str | None:
    """Search Exa API for images matching the query."""
    url = "https://api.exa.ai/search"
    headers = {
        "Content-Type": "application/json",
        "x-api-key": EXA_API_KEY
    }
    
    payload = {
        "query": query,
        "type": "auto",
        "numResults": 5,
        "contents": {
            "text": {"maxCharacters": 500}
        }
    }
    
    try:
        response = requests.post(url, json=payload, headers=headers, timeout=30)
        response.raise_for_status()
        data = response.json()
        
        # Try to find an image URL from results
        for result in data.get("results", []):
            # Check if result has an image
            if result.get("image"):
                return result["image"]
            # Try to extract image from URL or text
            url = result.get("url", "")
            if any(ext in url.lower() for ext in [".jpg", ".jpeg", ".png", ".webp"]):
                return url
        
        return None
    except Exception as e:
        print(f"Error searching Exa for {loc_type}: {e}")
        return None


def download_image(url: str, save_path: Path) -> bool:
    """Download image from URL and save to path."""
    try:
        response = requests.get(url, timeout=30, headers={
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
        })
        response.raise_for_status()
        
        # Determine extension from content type
        content_type = response.headers.get("Content-Type", "")
        if "jpeg" in content_type or "jpg" in content_type:
            ext = ".jpg"
        elif "png" in content_type:
            ext = ".png"
        elif "webp" in content_type:
            ext = ".webp"
        else:
            ext = ".jpg"  # default
        
        final_path = save_path.with_suffix(ext)
        final_path.write_bytes(response.content)
        print(f"Downloaded: {final_path}")
        return True
    except Exception as e:
        print(f"Error downloading {url}: {e}")
        return False


def get_placeholder_images() -> dict[str, str]:
    """Get or generate placeholder images for each location type."""
    images_dir = Path(__file__).parent / "images"
    images_dir.mkdir(exist_ok=True)
    
    type_images = {}
    
    for loc_type, config in LOCATION_TYPES.items():
        # Check if image already exists
        for ext in [".jpg", ".jpeg", ".png", ".webp"]:
            img_path = images_dir / f"{loc_type}{ext}"
            if img_path.exists():
                type_images[loc_type] = str(img_path)
                print(f"Using existing image for {loc_type}")
                break
        else:
            # Need to fetch image
            print(f"Searching for {loc_type} image...")
            query = config["search_query"]
            image_url = search_exa_for_image(query, loc_type)
            
            if image_url:
                save_path = images_dir / loc_type
                if download_image(image_url, save_path):
                    # Find the saved file
                    for ext in [".jpg", ".jpeg", ".png", ".webp"]:
                        img_path = images_dir / f"{loc_type}{ext}"
                        if img_path.exists():
                            type_images[loc_type] = str(img_path)
                            break
    
    return type_images


def main():
    """Main function to process data and add image URLs."""
    data_path = Path(__file__).parent / "data.json"
    
    # Load data
    with open(data_path, "r", encoding="utf-8") as f:
        data = json.load(f)
    
    print(f"Processing {len(data)} locations...")
    
    # Classify all locations first
    type_counts = {}
    for item in data:
        poi_name = item.get("poi_name", "")
        characteristic = item.get("characteristic_vi", "")
        loc_type = classify_location(poi_name, characteristic)
        item["location_type"] = loc_type
        type_counts[loc_type] = type_counts.get(loc_type, 0) + 1
    
    print("\nLocation type distribution:")
    for loc_type, count in sorted(type_counts.items(), key=lambda x: -x[1]):
        print(f"  {loc_type}: {count}")
    
    # Get placeholder images for each type
    print("\nFetching placeholder images...")
    type_images = get_placeholder_images()
    
    # Add image_url to each data point
    images_dir = Path(__file__).parent / "images"
    for item in data:
        loc_type = item.get("location_type", "restaurant")
        # Use relative path for portability
        for ext in [".jpg", ".jpeg", ".png", ".webp"]:
            img_path = images_dir / f"{loc_type}{ext}"
            if img_path.exists():
                item["image_url"] = f"images/{loc_type}{ext}"
                break
        else:
            item["image_url"] = None
    
    # Save updated data
    with open(data_path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    
    print(f"\nUpdated {len(data)} locations with image_url field")
    print(f"Images saved to: {images_dir}")


if __name__ == "__main__":
    main()
