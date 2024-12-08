import ipaddress
import socket
import concurrent.futures

def get_domain_for_ip(ip):
    try:
        # Perform reverse DNS lookup
        domain = socket.gethostbyaddr(str(ip))[0]
        return f"{ip}: {domain}"
    except (socket.herror, socket.gaierror):
        return f"{ip}: No domain found"

def lookup_ip_range(start_ip, end_ip):
    # Convert IP range to IP network
    start = ipaddress.ip_address(start_ip)
    end = ipaddress.ip_address(end_ip)
    
    # Generate list of IPs in the range
    ip_list = [ip for ip in ipaddress.summarize_address_range(start, end)]
    
    # Flatten the IP network into individual IPs
    flat_ips = []
    for network in ip_list:
        flat_ips.extend(map(str, network))
    
    # Use concurrent futures for faster lookups
    results = []
    with concurrent.futures.ThreadPoolExecutor(max_workers=50) as executor:
        # Map the lookup function to all IPs
        future_to_ip = {executor.submit(get_domain_for_ip, ip): ip for ip in flat_ips}
        
        for future in concurrent.futures.as_completed(future_to_ip):
            try:
                result = future.result()
                print(result)
                results.append(result)
            except Exception as exc:
                print(f'An error occurred: {exc}')
    
    return results

def main():
    start_ip = '23.227.32.0'
    end_ip = '23.227.63.255'
    
    print(f"Looking up domain names for IP range {start_ip} - {end_ip}")
    
    results = lookup_ip_range(start_ip, end_ip)
    
    # Write results to a file
    with open('ip_domain_lookup.txt', 'w') as f:
        for result in results:
            f.write(result + '\n')
            print(result)

if __name__ == '__main__':
    main()
