import requests
import subprocess
import os
from urllib.parse import urlparse
import clickhouse_connect
import json
from datetime import datetime

def google_cse_search(api_key, cse_id):
    """
    Perform a Google Custom Search without a specific query,
    targeting Shopify domains.
    """
    base_url = "https://www.googleapis.com/customsearch/v1"
    
    # Parameters for the search
    params = {
        'key': api_key,
        'cx': cse_id,
        'q': 'site:myshopify.com -inurl:/',  # Search for Shopify domains
        'siteSearch': 'myshopify.com',
        'siteSearchFilter': 'i',
        'num': 10,  # Number of results per page
        'start': 1  # Starting result index
    }
    
    unique_domains = set()
    
    try:
        response = requests.get(base_url, params=params)
        response.raise_for_status()  # Raise an exception for bad responses
        
        search_results = response.json()
        
        # Extract and process unique domains
        if 'items' in search_results:
            for item in search_results['items']:
                # Parse the URL and extract domain
                parsed_url = urlparse(item['link'])
                domain = parsed_url.netloc
                if item['pagemap']['metatags'] and 'og:url' in item['pagemap']['metatags'][0]:
                    domain = urlparse(item['pagemap']['metatags'][0]['og:url']).netloc
                
                # Add to unique domains set
                unique_domains.add(domain)
        
        return unique_domains
    
    except requests.RequestException as e:
        print(f"Error making API request: {e}")
        return set()
    except KeyError as e:
        print(f"Error parsing API response: {e}")
        return set()

def get_similarweb_data(domain):
    """
    Fetch SimilarWeb data using exact cURL command
    """
    curl_command = [
        'curl', 
        f'https://data.similarweb.com/api/v1/data?domain={domain}', 
        '--compressed', 
        '-H', 'User-Agent: Mozilla/5.0 (X11; Linux x86_64; rv:130.0) Gecko/20100101 Firefox/130.0'
    ]
    
    try:
        # Execute curl command
        result = subprocess.run(curl_command, capture_output=True, text=True, check=True)
        
        # Parse and return JSON
        return json.loads(result.stdout)
    
    except subprocess.CalledProcessError as e:
        print(f"cURL error for {domain}: {e}")
        print(f"Error output: {e.stderr}")
        return None
    except json.JSONDecodeError:
        print(f"Failed to parse JSON for {domain}")
        return None

def ingest_to_clickhouse(client, domain_data):
    """
    Ingest SimilarWeb data into ClickHouse tables
    """
    print("domain_data: ", domain_data)
    # Main Domain Statistics
    domain_stats_row = [
        domain_data.get('SiteName', ''),
        domain_data.get('Description', ''),
        domain_data.get('Title', ''),
        domain_data.get('Category', ''),
        int(domain_data.get('IsSmall', False)),
        datetime.fromisoformat(domain_data.get('SnapshotDate', '')),
        
        float(domain_data.get('Engagments', {}).get('BounceRate', 0)),
        float(domain_data.get('Engagments', {}).get('PagePerVisit', 0)),
        int(domain_data.get('Engagments', {}).get('Visits', 0)),
        float(domain_data.get('Engagments', {}).get('TimeOnSite', 0)),
        int(domain_data.get('Engagments', {}).get('Month', 0)),
        int(domain_data.get('Engagments', {}).get('Year', 0)),
        
        int(domain_data.get('EstimatedMonthlyVisits', {}).get('2024-08-01', 0)),
        int(domain_data.get('EstimatedMonthlyVisits', {}).get('2024-09-01', 0)),
        int(domain_data.get('EstimatedMonthlyVisits', {}).get('2024-10-01', 0)),
        
        domain_data.get('GlobalRank', {}).get('Rank'),
        domain_data.get('CountryRank', {}).get('Rank'),
        domain_data.get('CountryRank', {}).get('CountryCode'),
        domain_data.get('CategoryRank', {}).get('Rank')
    ]
    
    domain_stats_columns = [
        'site_name', 'description', 'title', 'category', 'is_small', 'snapshot_date',
        'bounce_rate', 'page_per_visit', 'visits', 'time_on_site', 'month', 'year',
        'visits_aug_2024', 'visits_sep_2024', 'visits_oct_2024',
        'global_rank', 'country_rank', 'country_code', 'category_rank'
    ]
    
    client.insert('similarweb_domain_stats', [domain_stats_row], column_names=domain_stats_columns)
    
    # Traffic Sources
    traffic_sources_row = [
        domain_data.get('SiteName', ''),
        datetime.fromisoformat(domain_data.get('SnapshotDate', '')),
        float(domain_data.get('TrafficSources', {}).get('Social', 0)),
        float(domain_data.get('TrafficSources', {}).get('Paid Referrals', 0)),
        float(domain_data.get('TrafficSources', {}).get('Mail', 0)),
        float(domain_data.get('TrafficSources', {}).get('Referrals', 0)),
        float(domain_data.get('TrafficSources', {}).get('Search', 0)),
        float(domain_data.get('TrafficSources', {}).get('Direct', 0))
    ]
    
    traffic_sources_columns = [
        'site_name', 'snapshot_date', 
        'social_traffic', 'paid_referrals_traffic', 'mail_traffic', 
        'referrals_traffic', 'search_traffic', 'direct_traffic'
    ]
    
    client.insert('similarweb_traffic_sources', [traffic_sources_row], column_names=traffic_sources_columns)
    
    # Top Countries
    top_countries_rows = [
        [
            domain_data.get('SiteName', ''),
            datetime.fromisoformat(domain_data.get('SnapshotDate', '')),
            country.get('CountryCode', ''),
            country.get('Country', 0),
            float(country.get('Value', 0))
        ]
        for country in domain_data.get('TopCountryShares', [])
    ]
    
    top_countries_columns = [
        'site_name', 'snapshot_date', 
        'country_code', 'country_id', 'country_share'
    ]
    
    if top_countries_rows:
        client.insert('similarweb_top_countries', top_countries_rows, column_names=top_countries_columns)
    
    # Top Keywords
    top_keywords_rows = [
        [
            domain_data.get('SiteName', ''),
            datetime.fromisoformat(domain_data.get('SnapshotDate', '')),
            keyword.get('Name', ''),
            float(keyword.get('EstimatedValue', 0)),
            int(keyword.get('Volume', 0)),
            keyword.get('Cpc')
        ]
        for keyword in domain_data.get('TopKeywords', [])
    ]
    
    top_keywords_columns = [
        'site_name', 'snapshot_date', 
        'keyword', 'estimated_value', 'volume', 'cpc'
    ]
    
    if top_keywords_rows:
        client.insert('similarweb_top_keywords', top_keywords_rows, column_names=top_keywords_columns)

def main():
    api_key =  os.environ.get("GOOGLE_CSE_API_KEY")
    cse_id = "80b443a807a8742d5"

    client = clickhouse_connect.get_client(
        host='localhost',
        port=8123,
        database='scoopify',
        username='default',
        password=''
    )
    
    if not api_key or not cse_id:
        print("Please set GOOGLE_CSE_API_KEY and GOOGLE_CSE_ID environment variables")
        return
    
    # Perform the search
    domains = google_cse_search(api_key, cse_id)
    
    # Print unique domains
    print("Unique Shopify Domains:")
    for domain in domains:
        sw_data = get_similarweb_data(domain)
        if sw_data:
            ingest_to_clickhouse(client, sw_data)
        else:
            print("No SimilarWeb data available for this domain")
        print(domain)

if __name__ == "__main__":
    main()
