import boto3
import json
import logging
import os
import random
import time

logger = logging.getLogger()
logger.setLevel(logging.INFO)

# Initialize clients
ecs_client = boto3.client('ecs')
cloudwatch = boto3.client('cloudwatch')

# Configuration
CLUSTER_NAME = os.environ.get('CLUSTER_NAME', 'credlink-production-cluster')
SERVICE_NAME = os.environ.get('SERVICE_NAME', 'credlink-production-service')

def lambda_handler(event, context):
    """Chaos Engineering Lambda Handler"""
    
    try:
        # Parse event
        experiment_type = event.get('experiment_type', 'random')
        
        logger.info(f"Starting chaos engineering experiment: {experiment_type}")
        
        # Run the requested experiment
        if experiment_type == 'kill_random_task':
            result = kill_random_task()
        elif experiment_type == 'scale_up_down':
            result = scale_up_down()
        elif experiment_type == 'network_latency':
            result = simulate_network_latency()
        elif experiment_type == 'random':
            result = run_random_experiment()
        else:
            raise ValueError(f"Unknown experiment type: {experiment_type}")
        
        # Send metrics
        send_chaos_metrics(experiment_type, result)
        
        return {
            'statusCode': 200,
            'body': json.dumps({
                'experiment_type': experiment_type,
                'result': result,
                'timestamp': time.time()
            })
        }
        
    except Exception as e:
        logger.error(f"Chaos experiment failed: {str(e)}")
        send_chaos_metrics(experiment_type, {'error': str(e)})
        raise e

def kill_random_task():
    """Kill a random ECS task"""
    
    logger.info("Starting kill_random_task experiment")
    
    # List running tasks
    response = ecs_client.list_tasks(
        cluster=CLUSTER_NAME,
        serviceName=SERVICE_NAME,
        desiredStatus='RUNNING'
    )
    
    task_arns = response['taskArns']
    
    if not task_arns:
        return {'status': 'no_tasks_running', 'message': 'No running tasks to kill'}
    
    # Select random task
    selected_task = random.choice(task_arns)
    task_id = selected_task.split('/')[-1]
    
    logger.info(f"Selected task to kill: {task_id}")
    
    # Stop the task
    ecs_client.stop_task(
        cluster=CLUSTER_NAME,
        task=task_id,
        reason='Chaos engineering experiment'
    )
    
    # Wait for task to stop
    waiter = ecs_client.get_waiter('tasks_stopped')
    waiter.wait(
        cluster=CLUSTER_NAME,
        tasks=[task_id],
        WaiterConfig={
            'Delay': 5,
            'MaxAttempts': 30
        }
    )
    
    logger.info(f"Successfully killed task: {task_id}")
    
    return {
        'status': 'success',
        'killed_task': task_id,
        'total_tasks_before': len(task_arns),
        'message': f'Killed task {task_id} as part of chaos experiment'
    }

def scale_up_down():
    """Scale the service up and then down"""
    
    logger.info("Starting scale_up_down experiment")
    
    # Get current desired count
    service = ecs_client.describe_service(
        cluster=CLUSTER_NAME,
        service=SERVICE_NAME
    )
    
    current_count = service['service']['desiredCount']
    min_count = service['service']['runningCount']
    
    logger.info(f"Current desired count: {current_count}")
    
    # Scale up by 2 tasks (max 20)
    new_count = min(current_count + 2, 20)
    
    logger.info(f"Scaling up to {new_count} tasks")
    
    # Update service
    ecs_client.update_service(
        cluster=CLUSTER_NAME,
        service=SERVICE_NAME,
        desiredCount=new_count
    )
    
    # Wait for scaling to complete
    waiter = ecs_client.get_waiter('services_stable')
    waiter.wait(
        cluster=CLUSTER_NAME,
        services=[SERVICE_NAME],
        WaiterConfig={
            'Delay': 10,
            'MaxAttempts': 30
        }
    )
    
    logger.info(f"Successfully scaled to {new_count} tasks")
    
    # Wait a bit
    time.sleep(30)
    
    # Scale back to original
    logger.info(f"Scaling back to {current_count} tasks")
    
    ecs_client.update_service(
        cluster=CLUSTER_NAME,
        service=SERVICE_NAME,
        desiredCount=current_count
    )
    
    # Wait for scaling to complete
    waiter.wait(
        cluster=CLUSTER_NAME,
        services=[SERVICE_NAME],
        WaiterConfig={
            'Delay': 10,
            'MaxAttempts': 30
        }
    )
    
    logger.info(f"Successfully scaled back to {current_count} tasks")
    
    return {
        'status': 'success',
        'original_count': current_count,
        'scaled_to': new_count,
        'final_count': current_count,
        'message': f'Scaled from {current_count} to {new_count} and back'
    }

def simulate_network_latency():
    """Simulate network latency by adding CPU stress"""
    
    logger.info("Starting network_latency simulation")
    
    # This is a simplified version - in reality, you'd use
    # AWS Network Load Balancer features or other tools
    
    # For now, we'll trigger a scale event which causes temporary
    # network disruption as new tasks come online
    
    result = scale_up_down()
    
    return {
        'status': 'success',
        'experiment': 'network_latency_simulation',
        'method': 'scale_up_down',
        'result': result,
        'message': 'Simulated network latency through scaling events'
    }

def run_random_experiment():
    """Run a random chaos experiment"""
    
    experiments = [
        'kill_random_task',
        'scale_up_down',
        'network_latency'
    ]
    
    selected = random.choice(experiments)
    logger.info(f"Randomly selected experiment: {selected}")
    
    if selected == 'kill_random_task':
        return kill_random_task()
    elif selected == 'scale_up_down':
        return scale_up_down()
    elif selected == 'network_latency':
        return simulate_network_latency()

def send_chaos_metrics(experiment_type, result):
    """Send chaos experiment metrics to CloudWatch"""
    
    try:
        # Send success/failure metric
        status = 1 if result.get('status') == 'success' else 0
        
        cloudwatch.put_metric_data(
            Namespace='CredLinkChaos',
            MetricData=[
                {
                    'MetricName': 'ChaosExperimentResult',
                    'Dimensions': [
                        {
                            'Name': 'ExperimentType',
                            'Value': experiment_type
                        }
                    ],
                    'Value': status,
                    'Unit': 'Count'
                },
                {
                    'MetricName': 'ChaosExperimentCount',
                    'Value': 1,
                    'Unit': 'Count'
                }
            ]
        )
        
        logger.info(f"Sent chaos metrics for {experiment_type}")
        
    except Exception as e:
        logger.error(f"Failed to send chaos metrics: {str(e)}")

def get_service_health():
    """Get current service health metrics"""
    
    try:
        service = ecs_client.describe_service(
            cluster=CLUSTER_NAME,
            service=SERVICE_NAME
        )
        
        return {
            'running_count': service['service']['runningCount'],
            'desired_count': service['service']['desiredCount'],
            'pending_count': service['service']['pendingCount'],
            'status': service['service']['status']
        }
        
    except Exception as e:
        logger.error(f"Failed to get service health: {str(e)}")
        return {'error': str(e)}
